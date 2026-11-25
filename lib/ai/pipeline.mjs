// 질문 1회 처리 (순차): ① 해금 판정(빠른 모델) → ② 코드: 반려 여부·절대 기준·점수 합산·해금선 비교
//   → ③ 코드: 상태 갱신·메인 모델 프롬프트 조립 → ④ 메인 모델 1회 → ⑤ 답변 검증(빠른 모델, 기존 규칙).
// 반려·되묻기면 메인 모델을 부르지 않는다. 저장은 하지 않는다. 호출자(route)가 결과를 한 트랜잭션으로 저장한다.
// 설계: docs/game/AI_REDESIGN_DECISIONS.md

import { fill } from '../game/josa.mjs';
import { roles, caseKeywords } from '../game/data/case.mjs';
import { characters } from '../game/data/characters.mjs';
import {
  factView, attachEvidence, templateVars, lockedFacts, applyJudgement, MAX_QUESTIONS_PER_MESSAGE
} from '../game/game.mjs';
import * as P from './prompts.mjs';
import { deadlineSignal } from './llm.mjs';

const MAX_REPLY = 1200;
/** 질문 1회 전체 마감. 호출이 여러 번 이어져도 이 안에서 끝낸다(넘으면 LlmError → 502). */
const QUESTION_DEADLINE_MS = 25000;

/** 메시지 전체의 질문 유형: 모두 잡담이면 chat, 하나라도 추궁이면 accuse, 그 밖엔 case */
function messageKind(questions) {
  if (questions.every(q => q.kind === 'chat')) return 'chat';
  return questions.some(q => q.kind === 'accuse') ? 'accuse' : 'case';
}

/**
 * @param {object} p
 * @param {(task, req) => Promise<{value, metric}>} p.model
 * @param {{ cast, victim, state }} p.game
 * @param {'A'|'B'|'C'|'D'} p.roleId
 * @param {string} p.question
 * @param {null | {type:'turn', id, npc, reply, facts:string[]} | {type:'clue', id, title}} p.attach
 * @param {Array<{question, reply, attach}>} p.history 이 NPC와의 지난 대화
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
  const attachment = attach && (attach.type === 'turn'
    ? { 종류: '다른 사람의 발언', 말한사람: characters[attach.npc].name, 내용: attach.reply }
    : { 종류: '단서 카드', 제목: attach.title });
  const historyData = history.map(h => ({ 질문: h.question, 답: h.reply, ...(h.attach ? { 첨부: h.attach.title ?? h.attach.reply } : {}) }));
  const evidence = attachEvidence(attach, attach?.facts);

  // ① 해금 판정: 질문 수 세기 + 질문별 기준 값. 후보는 이 NPC의 아직 잠긴 사실뿐 (스키마 enum 으로 형식 검사)
  const locked = lockedFacts(roleId, before);
  const judged = await call('judge', {
    tier: 'fast', maxTokens: 1200,
    system: P.JUDGE_RULES,
    user: P.judgeUser({ game, roleId, state: before, locked, attachment, history: historyData, question }),
    schema: P.judgeSchema(locked.map(f => f.id)),
    meta: {
      question,
      state: before,
      evidence,
      attached: !!attach,
      locked: locked.map(f => ({ id: f.id, unlock: f.unlock })),
      intentKeywords: Object.fromEntries(Object.entries(roles[roleId].intents).map(([id, it]) => [id, it.keywords ?? []])),
      recentQuestions: history.map(h => h.question)
    }
  });
  const questions = judged.questions;
  const count = questions.length;
  const debugBase = { countReason: judged.count_reason, questions, calls };

  // ② 반려·되묻기: 메인 모델을 부르지 않는다
  if (judged.unclear || count === 0) return { status: 'clarify', count: 0, debug: debugBase };
  if (count > MAX_QUESTIONS_PER_MESSAGE) return { status: 'rejected', reason: 'too_many', count, debug: debugBase };
  if (count > remaining) return { status: 'rejected', reason: 'over_remaining', count, debug: debugBase };

  // ② 절대 기준·점수 합산·해금선 비교 → ③ 상태 갱신
  const applied = applyJudgement(roleId, before, questions, { evidence, attached: !!attach });
  const view = factView(roleId, applied.state, applied.newly);
  const kind = messageKind(questions);
  const repeat = questions.some(q => q.repeat);

  // ④ 메인 모델: 정확한 상태로 한 번 호출
  const system = P.draftSystem(game, roleId);
  const makeDraft = retryReason => call('draft', {
    tier: 'main', maxTokens: count > 1 ? 900 : 700,
    system,
    user: P.draftUser({
      game, view, history: historyData, attachment, kind, repeat, question,
      questions: questions.map(q => q.text), retryReason
    }),
    schema: P.DRAFT_SCHEMA,
    meta: {
      question, kind,
      fresh: view.fresh.map(f => fill(f.say, vars)),
      active: view.active.map(f => fill(f.say, vars))
    }
  });
  let draft = await makeDraft();

  // ⑤ 답변 검증 (기존 규칙 유지: 위험도 기반, 반려 시 이유를 알려 주고 한 번 다시 만든다)
  const allowed = [...view.active, ...view.fresh];
  const verify = d => call('verify', {
    tier: 'fast', maxTokens: 300,
    system: P.VERIFY_RULES,
    user: P.verifyUser({ game, roleId, view, kind, question, attachment, draft: d }),
    schema: P.verifySchema(allowed.map(f => f.id)),
    meta: { reply: d.reply, allowed: allowed.map(f => ({ id: f.id, say: fill(f.say, vars) })) }
  });
  // 검증을 건너뛰는 것은 '사건과 무관한 한글 잡담'일 때뿐이다.
  // 영문 등 다른 문자가 섞이면 키워드 검사로는 누설을 못 잡으므로 검증한다.
  const needsVerify = d => kind !== 'chat' || applied.newly.length > 0 || !!attach
    || caseKeywords.some(w => d.reply.includes(w)) || /[A-Za-z]/.test(d.reply);

  // 빈 답·너무 긴 답은 서버 오류가 아니라 '반려'로 다룬다.
  const shapeOk = d => !!d.reply.trim() && d.reply.length <= MAX_REPLY;
  const SHAPE_FAIL = { pass: false, reason: '답변 형식 오류 (빈 답 또는 너무 긴 답)', disclosed: [] };
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
    system: P.MOTIVE_RULES, user: P.motiveUser({ reference, answer }),
    schema: P.MOTIVE_SCHEMA, meta: { answer }
  });
  return { match: r.value.match, metric: r.metric };
}
