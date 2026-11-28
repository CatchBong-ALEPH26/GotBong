// 질문 1회 처리 (순차): ① 해금 판정(빠른 모델) → ② 코드: 반려 여부·절대 기준·근거 확인·점수 합산·해금선 비교
//   → ③ 코드: 상태 갱신·메인 모델 프롬프트 조립 → ④ 메인 모델 1회 → ⑤ 답변 검증(빠른 모델, 기존 규칙).
// 반려·되묻기면 메인 모델을 부르지 않는다. 저장은 하지 않는다. 호출자(route)가 결과를 한 트랜잭션으로 저장한다.
// 캐시: 모든 호출은 정적인 것 → 동적인 것 순서(prompts.mjs 의 T0~T6). 판정·검증은 system 전체(FAST_RULES + fastPrefix)와
// 스키마(fastSchema)가 같고, 할 작업은 user 맨 끝에서 고른다. 같은 게임은 NPC 와 관계없이 같은 cacheKey 로 묶는다.
// 설계: docs/game/AI_REDESIGN_DECISIONS.md

import { fill } from '../game/josa.mjs';
import { availableFacts } from '../game/data/ransomware.mjs';
import { caseKeywords } from '../game/data/case.mjs';
import { characters } from '../game/data/characters.mjs';
import {
  factView, attachEvidence, templateVars, factStatus, applyJudgement, MAX_QUESTIONS_PER_MESSAGE
} from '../game/game.mjs';
import * as P from './prompts.mjs';
import { deadlineSignal, LlmError } from './llm.mjs';

const MAX_REPLY = 1200;
/** 말버릇 앙케이트에서 말투를 설명하는 글. 대사에 이대로 나오면 모델이 지시를 대사로 옮긴 것이다. */
export const SURVEY_LABEL_LEAK = /본론만 이야기함|시어요체|어요체|냐체와 데체/;
/** 질문 1회 전체 마감. 호출이 여러 번 이어져도 이 안에서 끝낸다(넘으면 LlmError → 502). */
const QUESTION_DEADLINE_MS = 25000;

/** 메시지 전체의 질문 유형: 모두 잡담이면 chat, 하나라도 추궁이면 accuse, 그 밖엔 case */
function messageKind(questions) {
  if (questions.every(q => q.kind === 'chat')) return 'chat';
  return questions.some(q => q.kind === 'accuse') ? 'accuse' : 'case';
}

/**
 * 같은 게임의 요청 묶음 이름 (OpenAI prompt_cache_key, 캐시 라우팅용). 게임 ID 그대로 보내지 않고 짧은 해시만 쓴다.
 * NPC 단위가 아니라 게임 단위다: 키가 같아야 같은 서버로 가서, 다른 NPC 호출도 전역 규칙(T0) 캐시를 같이 쓴다.
 * (NPC별 키였던 2026-11-28 측정: 여러 NPC에게 한 번씩 물으면 캐시 0%. AI_REDESIGN_DECISIONS.md 12.14)
 */
export function cacheKeyOf(game) {
  const text = game.id ?? JSON.stringify([game.cast, game.victim]);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 2246822519) >>> 0;
  }
  return `gotbong-${h1.toString(16)}${h2.toString(16)}`;
}

/** 판정·초안·검증이 함께 쓰는 입력: 첨부 요약(카드면 내용 포함), 대화 기록(오래된 것부터), 이번 첨부의 증거 원자 */
function inputs({ attach, history }) {
  const attachment = attach && (attach.type === 'turn'
    ? { 종류: '다른 사람의 발언', 말한사람: characters[attach.npc].name, 내용: attach.reply }
    : { 종류: '단서 카드', 제목: attach.title, ...(attach.detail ? { 내용: attach.detail } : {}) });
  const historyData = history.map(h => ({ 질문: h.question, 답: h.reply, ...(h.attach ? { 첨부: h.attach.title ?? h.attach.reply } : {}) }));
  return { attachment, historyData, evidence: attachEvidence(attach, attach?.facts) };
}

/** 빠른 모델 공통 출력에서 기대한 갈래(task)를 꺼낸다. 테스트용 가짜 모델은 감싸지 않은 값을 줄 수 있다. */
function branch(value, task) {
  const r = value?.result ?? value;
  if (r?.task && r.task !== task) throw new LlmError('AI 응답 형식이 올바르지 않습니다.');
  return r;
}

/**
 * ① 해금 판정만 한다 (빠른 모델 1회). 평가 도구(scripts/judge-probe.mjs)도 이 함수를 쓴다.
 * @param {{ call: (task, req) => Promise<any> }} p call 은 model 을 감싼 호출 함수 (값만 돌려준다)
 * @returns {Promise<{ count_reason, unclear, questions }>}
 */
export async function judgeMessage({ call, game, roleId, question, attach, history }) {
  const before = game.state[roleId];
  const { attachment, historyData, evidence } = inputs({ attach, history });
  const statuses = factStatus(roleId, before, evidence);
  const value = await call('judge', {
    tier: 'fast', maxTokens: 1200,
    system: [P.FAST_RULES, P.fastPrefix(game, roleId)],
    user: P.judgeUser({ statuses, history: historyData, attachment, question }),
    schema: P.fastSchema(roleId),
    cacheKey: cacheKeyOf(game),
    meta: {
      question,
      statuses,
      facts: availableFacts(roleId, game.cast._alibi ?? 'A').filter(f => !f.start).map(f => ({ id: f.id, keywords: f.keywords ?? [], needs: f.needs })),
      evidenceNow: evidence,
      shown: [...new Set([...before.evidence, ...evidence])],
      attached: !!attach,
      grounded: !!attach || history.length > 0,
      recentQuestions: history.map(h => h.question)
    }
  });
  return branch(value, 'judge');
}

/**
 * @param {object} p
 * @param {(task, req) => Promise<{value, metric}>} p.model
 * @param {{ id?, cast, victim, state }} p.game
 * @param {'A'|'B'|'C'|'D'} p.roleId
 * @param {string} p.question
 * @param {null | {type:'turn', id, npc, reply, facts:string[]} | {type:'clue', id, title, detail?}} p.attach
 * @param {Array<{question, reply, attach}>} p.history 이 NPC와의 지난 대화 (오래된 것부터)
 * @param {number} [p.remaining] 남은 질문 수 (이보다 많이 물으면 반려)
 * @returns {Promise<
 *   { status: 'clarify', debug } |
 *   { status: 'rejected', reason: 'too_many'|'over_remaining', count, debug } |
 *   { status: 'answered', pass, count, reply, emotion, disclosed, state, scored, debug }
 * >}
 */
export async function runQuestion({ model, game, roleId, question, attach, history, remaining = Infinity }) {
  const calls = [];
  const signal = deadlineSignal(QUESTION_DEADLINE_MS);
  const call = async (task, req) => {
    const r = await model(task, { ...req, signal });
    calls.push(r.metric);
    return r.value;
  };
  const vars = templateVars(game);
  const before = game.state[roleId];
  const { attachment, historyData, evidence } = inputs({ attach, history });
  const cacheKey = cacheKeyOf(game);

  // ① 해금 판정: 질문 수 세기 + 질문별 기준 값
  const judged = await judgeMessage({ call, game, roleId, question, attach, history });
  const questions = judged.questions;
  const count = questions.length;
  const debugBase = { countReason: judged.count_reason, questions, calls };

  // ② 반려·되묻기: 메인 모델을 부르지 않는다
  if (judged.unclear || count === 0) return { status: 'clarify', count: 0, debug: debugBase };
  if (count > MAX_QUESTIONS_PER_MESSAGE) return { status: 'rejected', reason: 'too_many', count, debug: debugBase };
  if (count > remaining) return { status: 'rejected', reason: 'over_remaining', count, debug: debugBase };

  // ② 절대 기준·근거 확인·점수 합산·해금선 비교 → ③ 상태 갱신
  const applied = applyJudgement(roleId, before, questions, { evidence, attached: !!attach, grounded: !!attach || history.length > 0 });
  const view = factView(roleId, applied.state, applied.newly);
  const kind = messageKind(questions);
  const repeat = questions.some(q => q.repeat);

  // ④ 메인 모델: 정확한 상태로 한 번 호출 (system 은 한 게임·NPC 동안 고정)
  const system = P.draftSystem(game, roleId);
  const makeDraft = retryReason => call('draft', {
    tier: 'main', maxTokens: count > 1 ? 900 : 700,
    system,
    user: P.draftUser({
      game, view, history: historyData, attachment, kind, repeat, question,
      questions: questions.map(q => q.text), retryReason
    }),
    schema: P.DRAFT_SCHEMA,
    cacheKey,
    meta: {
      question, kind,
      fresh: view.fresh.map(f => fill(f.say, vars)),
      active: view.active.map(f => fill(f.say, vars))
    }
  });
  let draft = await makeDraft();

  // ⑤ 답변 검증 (기존 규칙 유지: 위험도 기반, 반려 시 이유를 알려 주고 한 번 다시 만든다)
  // 판정과 같은 고정 앞부분·스키마라서 판정 호출이 만든 캐시를 다시 쓴다.
  const allowed = [...view.active, ...view.fresh];
  const verify = async d => {
    const r = branch(await call('verify', {
      tier: 'fast', maxTokens: 300,
      system: [P.FAST_RULES, P.fastPrefix(game, roleId)],
      user: P.verifyUser({ roleId, view, kind, history: historyData, question, attachment, draft: d }),
      schema: P.fastSchema(roleId),
      cacheKey,
      meta: { reply: d.reply, allowed: allowed.map(f => ({ id: f.id, say: fill(f.say, vars) })) }
    }), 'verify');
    // 형식 확인: 말할 수 있는 사실만 공개된 것으로 기록한다 (스키마는 NPC 전체 ID 고정)
    return { ...r, disclosed: r.disclosed.filter(id => allowed.some(f => f.id === id)) };
  };
  // 검증을 건너뛰는 것은 '사건과 무관한 한글 잡담'일 때뿐이다.
  // 영문 등 다른 문자가 섞이면 키워드 검사로는 누설을 못 잡으므로 검증한다.
  const needsVerify = d => kind !== 'chat' || applied.newly.length > 0 || !!attach
    || caseKeywords.some(w => d.reply.includes(w)) || /[A-Za-z]/.test(d.reply);

  // 빈 답·너무 긴 답·말버릇 앙케이트의 설명 글을 대사로 옮긴 답은 서버 오류가 아니라 '반려'로 다룬다 (한 번 다시 만든다).
  const shapeOk = d => !!d.reply.trim() && d.reply.length <= MAX_REPLY && !SURVEY_LABEL_LEAK.test(d.reply);
  const SHAPE_FAIL = { pass: false, reason: '답변 형식 오류 (빈 답, 너무 긴 답, 또는 "본론만 이야기함"처럼 말투 설명 글을 대사에 적음)', disclosed: [] };
  const check = async d => (shapeOk(d) ? verify(d) : SHAPE_FAIL);

  let verdict = { pass: true, reason: '검증 생략 (사건 언급 없는 잡담)', disclosed: [] };
  const skippedVerify = shapeOk(draft) && !needsVerify(draft);
  let retried = false;
  if (!skippedVerify) {
    verdict = await check(draft);
    if (!verdict.pass) {
      retried = true;
      const second = await makeDraft(verdict.reason);
      const firstReason = verdict.reason;
      verdict = await check(second);
      if (verdict.pass) draft = second;
      else verdict.reason = firstReason + ' / 재시도: ' + verdict.reason;
    }
  }

  // 근접(해금선 미만이지만 S1≥1)은 내용을 바꾸지 않고 표정만 바꾼다
  const emotion = applied.near && draft.emotion === '기본' ? '당황' : draft.emotion;

  return {
    status: 'answered',
    pass: verdict.pass,
    count,
    reply: draft.reply.trim(),
    emotion,
    disclosed: verdict.disclosed,
    state: applied.state,
    scored: applied.scored,
    attached: !!attach,
    debug: {
      ...debugBase, kind, repeat, scored: applied.scored, near: applied.near,
      unlocked: applied.newly, draft: draft.reply, verdict: verdict.pass ? '통과' : '반려', reason: verdict.reason,
      retried, skippedVerify
    }
  };
}

/** 최종 제출 동기 채점 */
export async function gradeMotive({ model, reference, answer }) {
  const r = await model('motive', {
    tier: 'fast', maxTokens: 100,
    system: P.motiveSystem(reference), user: P.motiveUser({ answer }),
    schema: P.MOTIVE_SCHEMA, meta: { answer }
  });
  return { match: r.value.match, metric: r.metric };
}
