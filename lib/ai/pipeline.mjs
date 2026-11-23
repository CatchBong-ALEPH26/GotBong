// 질문 1회 처리: 분류 ∥ 초안(추측) → 상태 갱신 → (필요 시 재생성) → 검증 → 결과.
// 저장은 하지 않는다. 호출자(http.mjs)가 결과를 한 트랜잭션으로 저장한다.

import { fill } from '../game/josa.mjs';
import { roles, caseKeywords } from '../game/data/case.mjs';
import { characters } from '../game/data/characters.mjs';
import { advance, factView, openIntents, attachEvidence, templateVars } from '../game/game.mjs';
import * as P from './prompts.mjs';
import { deadlineSignal } from './llm.mjs';

const MAX_REPLY = 1200;
/** 질문 1회 전체 마감. 호출이 여러 번 이어져도 이 안에서 끝낸다(넘으면 LlmError → 502). */
const QUESTION_DEADLINE_MS = 25000;

export class ClarifyError extends Error {}

/**
 * @param {object} p
 * @param {(task, req) => Promise<{value, metric}>} p.model
 * @param {{ cast, victim, state }} p.game
 * @param {'A'|'B'|'C'|'D'} p.roleId
 * @param {string} p.question
 * @param {null | {type:'turn', id, npc, reply, facts:string[]} | {type:'clue', id, title}} p.attach
 * @param {Array<{question, reply, attach}>} p.history 이 NPC와의 지난 대화
 */
export async function runQuestion({ model, game, roleId, question, attach, history }) {
  const calls = [];
  const signal = deadlineSignal(QUESTION_DEADLINE_MS);
  const call = async (task, req) => {
    const r = await model(task, { ...req, signal });
    calls.push(r.metric);
    return r.value;
  };
  const vars = templateVars(game);
  const before = game.state[roleId];

  // 첨부로 생기는 해금은 코드가 즉시 판정한다
  const attachment = attach && (attach.type === 'turn'
    ? { 종류: '다른 사람의 발언', 말한사람: characters[attach.npc].name, 내용: attach.reply }
    : { 종류: '단서 카드', 제목: attach.title });
  const pre = advance(roleId, before, attachEvidence(attach, attach?.facts));

  // ① 분류와 ③ 초안(추측: 의도로 인한 새 해금 없음)을 동시에 시작
  const intents = openIntents(roleId, pre.state);
  const recent = history.slice(-2).map(h => ({ question: h.question, reply: h.reply }));
  const classifyP = call('classify', {
    tier: 'fast', maxTokens: 200,
    system: P.CLASSIFY_RULES,
    user: P.classifyUser({ game, roleId, intents, recent, attachment, question }),
    schema: P.classifySchema(intents),
    meta: {
      question,
      recentQuestions: history.map(h => h.question),
      intentKeywords: Object.fromEntries(intents.map(id => [id, roles[roleId].intents[id].keywords ?? []]))
    }
  });

  const system = P.draftSystem(game, roleId);
  const historyData = history.map(h => ({ 질문: h.question, 답: h.reply, ...(h.attach ? { 첨부: h.attach.title ?? h.attach.reply } : {}) }));
  const makeDraft = (view, kind, repeat, retryReason) => call('draft', {
    tier: 'main', maxTokens: 700,
    system,
    user: P.draftUser({ game, view, history: historyData, attachment, kind, repeat, question, retryReason }),
    schema: P.DRAFT_SCHEMA,
    meta: {
      question, kind,
      fresh: view.fresh.map(f => fill(f.say, vars)),
      active: view.active.map(f => fill(f.say, vars))
    }
  });

  // 추측 초안: 질문 유형은 초안 모델이 스스로 판단한다(kind=null). 의도로 새 해금이 생길 때만 다시 만든다.
  const preView = factView(roleId, pre.state, pre.newly);
  const speculative = makeDraft(preView, null, null).then(v => ({ ok: true, v }), e => ({ ok: false, e }));

  const cls = await classifyP;
  if (cls.kind === 'multi' || cls.kind === 'unclear') {
    await speculative; // 진행 중인 호출을 정리
    throw new ClarifyError(cls.kind === 'multi'
      ? '한 번에 하나씩 물어봐 주세요.'
      : '무엇을 묻는지 조금 더 구체적으로 적어 주세요.');
  }

  // ② 의도로 인한 해금
  const post = advance(roleId, pre.state, cls.intents.map(id => 'ask:' + id));
  const newly = [...pre.newly, ...post.newly];
  const view = factView(roleId, post.state, newly);

  let draft;
  let regenerated = false;
  const specResult = await speculative;
  if (post.newly.length || !specResult.ok) {
    draft = await makeDraft(view, cls.kind, cls.repeat);
    regenerated = specResult.ok; // 추측이 빗나가(새 해금) 다시 만든 경우
  } else {
    draft = specResult.v;
  }

  // ④ 검증 (위험도 기반)
  const allowed = [...view.active, ...view.fresh];
  const verify = d => call('verify', {
    tier: 'fast', maxTokens: 300,
    system: P.VERIFY_RULES,
    user: P.verifyUser({ game, roleId, view, kind: cls.kind, question, attachment, draft: d }),
    schema: P.verifySchema(allowed.map(f => f.id)),
    meta: { reply: d.reply, allowed: allowed.map(f => ({ id: f.id, say: fill(f.say, vars) })) }
  });
  // 검증을 건너뛰는 것은 '사건과 무관한 한글 잡담'일 때뿐이다.
  // 영문 등 다른 문자가 섞이면 키워드 검사로는 누설을 못 잡으므로 검증한다.
  const needsVerify = d => cls.kind !== 'chat' || newly.length > 0 || !!attach
    || caseKeywords.some(w => d.reply.includes(w)) || /[A-Za-z]/.test(d.reply);

  // 빈 답·너무 긴 답은 서버 오류가 아니라 '반려'로 다룬다 (질문 횟수는 줄지 않는다).
  const shapeOk = d => !!d.reply.trim() && d.reply.length <= MAX_REPLY;
  const SHAPE_FAIL = { pass: false, reason: '답변 형식 오류 (빈 답 또는 너무 긴 답)', disclosed: [] };
  const check = async d => (shapeOk(d) ? verify(d) : SHAPE_FAIL);

  let verdict = { pass: true, reason: '검증 생략 (사건 언급 없는 잡담)', disclosed: [] };
  let skippedVerify = shapeOk(draft) && !needsVerify(draft);
  let retried = false;
  if (!skippedVerify) {
    verdict = await check(draft);
    if (!verdict.pass) {
      // 반려 시 이유를 알려 주고 한 번 다시 만든다
      retried = true;
      const second = await makeDraft(view, cls.kind, cls.repeat, verdict.reason);
      const firstReason = verdict.reason;
      verdict = await check(second);
      if (verdict.pass) draft = second;
      else verdict.reason = firstReason + ' / 재시도: ' + verdict.reason;
    }
  }

  return {
    pass: verdict.pass,
    reply: draft.reply.trim(),
    emotion: draft.emotion,
    disclosed: verdict.disclosed,
    state: post.state,
    debug: {
      kind: cls.kind, intents: cls.intents, repeat: cls.repeat,
      unlocked: newly, draft: draft.reply, verdict: verdict.pass ? '통과' : '반려', reason: verdict.reason,
      regenerated, retried, skippedVerify, calls
    }
  };
}

/** 최종 제출 동기 채점 */
export async function gradeMotive({ model, reference, answer }) {
  const r = await model('motive', {
    tier: 'fast', maxTokens: 100,
    system: P.MOTIVE_RULES, user: P.motiveUser({ reference, answer }),
    schema: P.MOTIVE_SCHEMA, meta: { answer }
  });
  return { match: r.value.match, metric: r.metric };
}
