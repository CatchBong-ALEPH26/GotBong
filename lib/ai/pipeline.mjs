// 질문 1회 처리: 분류 ∥ 초안(추측) → 상태 갱신 → (필요 시 재생성) → 검증 → 결과.
// 저장은 하지 않는다. 호출자(http.mjs)가 결과를 한 트랜잭션으로 저장한다.

import { fill } from '../game/josa.mjs';
import { roles, caseKeywords } from '../game/data/case.mjs';
import { characters } from '../game/data/characters.mjs';
import { advance, factView, openIntents, attachEvidence, templateVars } from '../game/game.mjs';
import * as P from './prompts.mjs';

const MAX_REPLY = 1200;

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
  const call = async (task, req) => {
    const r = await model(task, req);
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
  const needsVerify = d => cls.kind !== 'chat' || newly.length > 0 || caseKeywords.some(w => d.reply.includes(w));

  const checkShape = d => {
    if (!d.reply.trim() || d.reply.length > MAX_REPLY) throw new Error('NPC 답변 형식 오류');
    return d;
  };

  let verdict = { pass: true, reason: '검증 생략 (사건 언급 없는 잡담)', disclosed: [] };
  let skippedVerify = !needsVerify(checkShape(draft));
  let retried = false;
  if (!skippedVerify) {
    verdict = await verify(draft);
    if (!verdict.pass) {
      // 반려 시 이유를 알려 주고 한 번 다시 만든다
      retried = true;
      const second = checkShape(await makeDraft(view, cls.kind, cls.repeat, verdict.reason));
      const firstReason = verdict.reason;
      verdict = await verify(second);
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
