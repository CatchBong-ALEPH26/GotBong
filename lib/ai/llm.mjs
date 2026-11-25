// LLM 클라이언트. 모든 호출은 같은 모양: model(task, { tier, system, user, schema, maxTokens, meta, cacheKey })
// system 은 문자열 또는 문자열 배열(고정 앞부분 → 작업 지시 순서. 캐시 친화 배치, prompts.mjs 참고).
// cacheKey 는 같은 앞부분을 쓰는 요청 묶음 이름 (OpenAI prompt_cache_key).
//   → { value, metric: { task, model, ms, inputTokens, outputTokens, cachedTokens } }
// tier: 'main'(대사 초안) | 'fast'(해금 판정·답변 검증·동기 채점)
// meta 는 고정 응답 모델(fixture)만 쓰는 구조화 정보다. Gemini 에는 보내지 않는다.

import { performance } from 'node:perf_hooks';
import { evaluate, needAtoms } from '../game/game.mjs';

export class LlmError extends Error {}

/** 호출 하나의 시간 제한과, 질문 전체의 마감(signal)을 함께 건다. */
function callSignal(ms, deadline) {
  const own = AbortSignal.timeout(ms);
  return deadline ? AbortSignal.any([own, deadline]) : own;
}

/** 마감까지 wait 만큼 기다릴 시간이 남았는지. 마감이 없으면 항상 참. */
function timeLeft(deadline, wait) {
  return !deadline || (!deadline.aborted && (deadline.deadlineAt ?? Infinity) - Date.now() > wait);
}

/** 성공 응답의 본문이 JSON이 아니면 서버 오류(500) 대신 LlmError(502)로 바꾼다. */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new LlmError('AI 응답 형식이 올바르지 않습니다.');
  }
}

/** 질문 1회 전체의 마감. 브라우저가 기다리다 같은 요청을 다시 보내기 전에 끝내기 위함. */
export function deadlineSignal(ms) {
  const signal = AbortSignal.timeout(ms);
  signal.deadlineAt = Date.now() + ms;
  return signal;
}

function thinkingConfig(value) {
  if (!value) return undefined;
  return /^\d+$/.test(value) ? { thinkingBudget: Number(value) } : { thinkingLevel: value };
}

/** 구조화 출력의 형식 검사 (중첩 객체·배열·정수·enum). 모델이 목록 밖의 값을 내면 오류로 본다. */
export function checkSchema(value, schema) {
  if (schema.anyOf) return schema.anyOf.some(branch => checkSchema(value, branch));
  switch (schema.type) {
    case 'object':
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      return (schema.required ?? Object.keys(schema.properties)).every(k => checkSchema(value[k], schema.properties[k]));
    case 'array':
      return Array.isArray(value) && value.every(x => checkSchema(x, schema.items));
    case 'integer':
      if (!Number.isInteger(value)) return false;
      break;
    default:
      if (typeof value !== schema.type) return false;
  }
  return !schema.enum || schema.enum.includes(value);
}

/**
 * @param {{ key: string, mainModel: string, fastModel: string, mainThinking?: string, fastThinking?: string }} options
 */
/** 429 응답에서 권장 대기 시간(ms)을 읽는다. RetryInfo.retryDelay 또는 본문의 "retry in Ns" */
function retryDelayMs(body) {
  const info = body?.error?.details?.find(d => d.retryDelay)?.retryDelay;
  const text = info ?? body?.error?.message?.match(/retry in ([\d.]+)s/i)?.[1];
  const sec = parseFloat(String(text ?? '').replace(/s$/, ''));
  return Number.isFinite(sec) ? Math.ceil(sec * 1000) + 250 : null;
}

/**
 * 한도 초과(429) 시 권장 대기 시간만큼 기다렸다 재시도한다.
 * maxWaitMs 를 넘는 대기가 필요하면 바로 오류를 낸다 (게임 중 플레이어를 오래 붙잡지 않기 위해).
 */
export function createGemini({ key, mainModel, fastModel, mainThinking, fastThinking, maxWaitMs = 12000, maxRetries = 2 }) {
  for (const m of [mainModel, fastModel]) {
    if (!/^[a-zA-Z0-9.-]+$/.test(m)) throw new Error('모델 이름 형식이 올바르지 않습니다: ' + m);
  }
  const models = { main: mainModel, fast: fastModel };
  const thinking = { main: thinkingConfig(mainThinking), fast: thinkingConfig(fastThinking) };

  return async (task, { tier, system, user, schema, maxTokens, signal }) => {
    const model = models[tier];
    const start = performance.now();
    // 생각(thinking) 토큰도 출력 한도에 포함되므로, 생각을 켰으면 여유를 둔다.
    const budget = thinking[tier]?.thinkingBudget;
    const outTokens = thinking[tier] && budget !== 0 ? maxTokens + 2000 : maxTokens;
    let response;
    for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST',
          signal: callSignal(30000, signal),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: [system].flat().join('\n\n') }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: schema,
              maxOutputTokens: outTokens,
              ...(thinking[tier] ? { thinkingConfig: thinking[tier] } : {})
            }
          })
        });
    } catch (error) {
      throw new LlmError(error.name === 'TimeoutError' ? 'AI 응답 시간이 초과됐습니다.' : 'AI 서버에 연결하지 못했습니다.');
    }
    if (response.status !== 429 || attempt >= maxRetries) break;
    const wait = retryDelayMs(await response.json().catch(() => null)) ?? 2000 * (attempt + 1);
    if (wait > maxWaitMs || !timeLeft(signal, wait)) break;
    await new Promise(r => setTimeout(r, wait));
    }
    if (!response.ok) {
      throw new LlmError(response.status === 429
        ? 'AI 사용량 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.'
        : 'AI 요청 오류 (HTTP ' + response.status + '). 모델 설정과 API 키를 확인해 주세요.');
    }
    const result = await readJson(response);
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new LlmError('AI 답변이 완성되지 않았습니다 (' + (candidate?.finishReason ?? '응답 없음') + ').');
    const raw = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('');
    let value;
    try { value = JSON.parse(raw); } catch { throw new LlmError('AI 응답 형식이 올바르지 않습니다.'); }
    if (!checkSchema(value, schema)) throw new LlmError('AI 응답 형식이 올바르지 않습니다.');
    const usage = result.usageMetadata ?? {};
    return {
      value,
      metric: {
        task, model, ms: Math.round(performance.now() - start),
        inputTokens: usage.promptTokenCount ?? null,
        outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) || null,
        cachedTokens: usage.cachedContentTokenCount ?? 0
      }
    };
  };
}

// ── 고정 응답 모델 (API 키 없이 실행·자동 테스트용) ─────────────
// 실제 언어 이해를 하지 않는다. 해금 판정은 근거(첨부·지난 첨부)와 사실별 핵심 요소 키워드(case.mjs 의 keywords)로
// 흉내 낸다: 근거를 갖춘 질문은 만점, 근거 없는 질문은 낮은 점수. 대사는 사실 문장을 이어 붙여 만든다.

const CHAT_WORDS = ['안녕', '점심', '좋아하', '취미', '요즘', '날씨', '배고'];
const ACCUSE_WORDS = ['네가 했', '당신이 했', '범인', '거짓말', '솔직히'];

/** 물음표로 질문을 나눈다. 물음표가 없으면 한 질문. */
export function splitQuestions(text) {
  return text.split(/[?？]+/).map(s => s.trim()).filter(s => /[\p{L}\p{N}]/u.test(s));
}

function fixtureJudge(meta) {
  const empty = reason => ({ task: 'judge', count_reason: reason, unclear: true, questions: [] });
  if (meta.question.includes('/모호')) return empty('테스트용 되묻기');
  const parts = splitQuestions(meta.question);
  if (!parts.length) return empty('알 수 없는 입력');
  const open = meta.facts.filter(f => ['available', 'blocked'].includes(meta.statuses.find(x => x.id === f.id).status));
  const byAvailability = [...open].sort((x, y) =>
    (meta.statuses.find(s => s.id === y.id).status === 'available') - (meta.statuses.find(s => s.id === x.id).status === 'available'));
  const fromAttach = f => needAtoms(f.needs).some(atom => meta.evidenceNow.includes(atom));
  const questions = parts.map(q => {
    const hit = f => f.keywords.some(w => q.includes(w));
    const pick = byAvailability.find(fromAttach) ?? byAvailability.find(hit) ?? null;
    const needsMet = pick ? evaluate(pick.needs, meta.shown) : false;
    const s2 = pick && meta.grounded && needsMet ? 2 : 0;
    const accuse = ACCUSE_WORDS.some(w => q.includes(w));
    const kind = accuse ? 'accuse' : CHAT_WORDS.some(w => q.includes(w)) ? 'chat' : 'case';
    return {
      text: q,
      reason: pick ? (s2 ? '테스트용: 근거와 핵심 요소를 갖춤' : '테스트용: 핵심 요소만 짚음') : '테스트용: 겨냥한 사실 없음',
      kind,
      repeat: meta.recentQuestions.some(r => r.includes(q)),
      target: pick?.id ?? 'none',
      g2: meta.attached ? (pick && fromAttach(pick) ? 'yes' : 'no') : 'na',
      g3: kind !== 'chat' && (!!pick || meta.attached),
      s1: pick ? 2 : 0,
      basis: s2 ? '테스트용 근거' : '없음',
      s2,
      s3: 0,
      s4: accuse && !(pick && needsMet) ? -1 : 0
    };
  });
  return { task: 'judge', count_reason: `물음표 기준 ${questions.length}개`, unclear: false, questions };
}

export async function fixture(task, { meta }) {
  let value;
  if (task === 'judge') {
    value = { result: fixtureJudge(meta) };

  } else if (task === 'draft') {
    // 테스트 모드에서 내부 시나리오 주석을 대사에서 제거
    const publicText = (facts) =>
      facts
        .map((text) =>
          text.replace(/\s*\([^()]*\)/g, '').trim()
        )
        .join(' ');

    if (meta.question === '/검증실패') {
      value = {
        reply: '[검증 실패 유도]',
        emotion: '기본'
      };
    } else if (meta.fresh.length) {
      value = {
        reply: publicText(meta.fresh),
        emotion: '당황'
      };
    } else if (
      (meta.kind ??
        (CHAT_WORDS.some(w => meta.question.includes(w))
          ? 'chat'
          : 'case')) === 'chat'
    ) {
      value = {
        reply: '(잡담 답변)',
        emotion: '웃음'
      };
    } else {
      value = {
        reply: publicText(meta.active),
        emotion: '기본'
      };
    }

  } else if (task === 'verify') {
    const pass = !meta.reply.includes('[검증 실패 유도]');

    value = { result: {
      task: 'verify',
      reason: pass ? '통과' : '테스트용 반려',
      pass,
      disclosed: pass
        ? meta.allowed
            .filter((fact) => {
              // 화면에 표시되는 문장과 같은 기준으로 비교
              const visibleFact = fact.say
                .replace(/\s*\([^()]*\)/g, '')
                .trim();

              return (
                visibleFact.length > 0 &&
                meta.reply.includes(visibleFact)
              );
            })
            .map((fact) => fact.id)
        : []
    } };
  } else if (task === 'motive') {
    // 여러 동기를 나열해 키워드만 맞추는 답(예: "놀림 복수 질투 표절")은 불일치로 본다 (MOTIVE_RULES).
    value = {
      match: /놀림|놀렸|놀려|비웃/.test(meta.answer) && /복수|앙갚음|똑같이|되갚/.test(meta.answer)
        && !/장난|표절|질투|보조배터리|코드 ?리뷰/.test(meta.answer)
    };
  } else {
    throw new Error('알 수 없는 작업: ' + task);
  }
  return { value, metric: { task, model: 'fixture', ms: 0, inputTokens: null, outputTokens: null, cachedTokens: 0 } };
}

// ── OpenAI (Chat Completions + Structured Outputs) ─────────────

/** strict 모드는 모든 객체에 additionalProperties:false 와 전체 required 가 필요하다 */
function strictSchema(schema) {
  if (schema?.anyOf) return { ...schema, anyOf: schema.anyOf.map(strictSchema) };
  if (schema?.type === 'object') {
    return {
      ...schema,
      additionalProperties: false,
      required: Object.keys(schema.properties),
      properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, strictSchema(v)]))
    };
  }
  if (schema?.type === 'array') return { ...schema, items: strictSchema(schema.items) };
  return schema;
}

/**
 * @param {{ key, mainModel, fastModel, mainReasoning?, fastReasoning?, maxWaitMs?, maxRetries? }} options
 *  mainReasoning/fastReasoning: 추론 모델용 reasoning_effort (none|minimal|low|medium|high). 비우면 보내지 않음
 */
/**
 * cache: { key?: boolean, retention?: 'in_memory' | '24h' }
 *  key=true 면 요청의 cacheKey 를 prompt_cache_key 로 보낸다 (같은 게임·NPC 묶음, 캐시 라우팅).
 *  retention 은 지정했을 때만 prompt_cache_retention 으로 보낸다 (모델마다 지원이 다르다. 문서 12.9).
 */
export function createOpenAI({ key, mainModel, fastModel, mainReasoning, fastReasoning, maxWaitMs = 12000, maxRetries = 2, cache = { key: true } }) {
  for (const m of [mainModel, fastModel]) {
    if (!/^[a-zA-Z0-9._-]+$/.test(m)) throw new Error('모델 이름 형식이 올바르지 않습니다: ' + m);
  }
  const models = { main: mainModel, fast: fastModel };
  const reasoning = { main: mainReasoning, fast: fastReasoning };

  return async (task, { tier, system, user, schema, maxTokens, signal, cacheKey }) => {
    const model = models[tier];
    const start = performance.now();
    const messages = [...[system].flat().map(content => ({ role: 'system', content })), { role: 'user', content: user }];
    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: callSignal(45000, signal),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model,
            messages,
            ...(cache.key && cacheKey ? { prompt_cache_key: cacheKey } : {}),
            ...(cache.retention ? { prompt_cache_retention: cache.retention } : {}),
            response_format: { type: 'json_schema', json_schema: { name: task, strict: true, schema: strictSchema(schema) } },
            // 추론 모델은 추론 토큰도 이 한도에 포함되므로 여유를 둔다
            max_completion_tokens: reasoning[tier] && reasoning[tier] !== 'none' ? maxTokens + 2000 : maxTokens,
            ...(reasoning[tier] ? { reasoning_effort: reasoning[tier] } : {})
          })
        });
      } catch (error) {
        throw new LlmError(error.name === 'TimeoutError' ? 'AI 응답 시간이 초과됐습니다.' : 'AI 서버에 연결하지 못했습니다.');
      }
      if (response.status !== 429 || attempt >= maxRetries) break;
      const header = Number(response.headers.get('retry-after-ms')) || Number(response.headers.get('retry-after')) * 1000;
      const wait = header ? header + 250 : 2000 * (attempt + 1);
      if (wait > maxWaitMs || !timeLeft(signal, wait)) break;
      await new Promise(r => setTimeout(r, wait));
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new LlmError(response.status === 429
        ? 'AI 사용량 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.'
        : 'AI 요청 오류 (HTTP ' + response.status + (detail?.error?.code ? ', ' + detail.error.code : '') + '). 모델 설정과 API 키를 확인해 주세요.');
    }
    const result = await readJson(response);
    const choice = result.choices?.[0];
    if (choice?.message?.refusal) throw new LlmError('AI가 답변을 거부했습니다.');
    if (choice?.finish_reason !== 'stop') throw new LlmError('AI 답변이 완성되지 않았습니다 (' + (choice?.finish_reason ?? '응답 없음') + ').');
    let value;
    try { value = JSON.parse(choice.message.content); } catch { throw new LlmError('AI 응답 형식이 올바르지 않습니다.'); }
    if (!checkSchema(value, schema)) throw new LlmError('AI 응답 형식이 올바르지 않습니다.');
    const usage = result.usage ?? {};
    return {
      value,
      metric: {
        task, model, ms: Math.round(performance.now() - start),
        inputTokens: usage.prompt_tokens ?? null,
        outputTokens: usage.completion_tokens ?? null,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0
      }
    };
  };
}

// ── 환경변수로 모델 선택 ─────────────────────────────────────
// LLM_PROVIDER=openai|gemini (비우면 OPENAI_API_KEY → GEMINI_API_KEY → 고정 응답 순)

export function modelFromEnv(env, overrides = {}) {
  const provider = env.LLM_PROVIDER || (env.OPENAI_API_KEY ? 'openai' : env.GEMINI_API_KEY ? 'gemini' : 'fixture');
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 가 없습니다.');
    // 기본값: 2026-11-20 비교 결과 (초안 gpt-4.1: 약 1.5초·말투 재현 우수 / 판정 gpt-4.1-mini)
    const mainModel = env.OPENAI_MODEL_MAIN || env.OPENAI_MODEL || 'gpt-4.1';
    const fastModel = env.OPENAI_MODEL_FAST || env.OPENAI_MODEL || 'gpt-4.1-mini';
    return {
      mode: 'openai', mainModel, fastModel,
      model: createOpenAI({
        key: env.OPENAI_API_KEY.trim(), mainModel, fastModel,
        mainReasoning: env.OPENAI_REASONING_MAIN, fastReasoning: env.OPENAI_REASONING_FAST,
        // OPENAI_CACHE_KEY=off 로 prompt_cache_key 를 끌 수 있다. OPENAI_CACHE_RETENTION=in_memory|24h 는 지정할 때만 보낸다
        cache: { key: env.OPENAI_CACHE_KEY !== 'off', retention: env.OPENAI_CACHE_RETENTION || undefined },
        ...overrides
      })
    };
  }
  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 가 없습니다.');
    const fallback = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const mainModel = env.GEMINI_MODEL_MAIN || fallback;
    const fastModel = env.GEMINI_MODEL_FAST || fallback;
    return {
      mode: 'gemini', mainModel, fastModel,
      model: createGemini({
        key: env.GEMINI_API_KEY.trim(), mainModel, fastModel,
        mainThinking: env.GEMINI_THINKING_MAIN, fastThinking: env.GEMINI_THINKING_FAST, ...overrides
      })
    };
  }
  return { mode: 'fixture', mainModel: 'fixture', fastModel: 'fixture', model: fixture };
}
