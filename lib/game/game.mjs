// 게임 규칙의 순수 함수 모음: 배정, 이름 치환, 상태 기계(해금 판정).
// LLM·DB·HTTP 를 모른다. 그래서 24가지 배정 전부를 빠르게 테스트할 수 있다.

import { randomInt } from 'node:crypto';
import { fill } from './josa.mjs';
import { characters, characterIds } from './data/characters.mjs';
import { victims } from './data/victims.mjs';
import * as scenario from './data/case.mjs';

const { roles, roleIds } = scenario;

// ── 배정 ────────────────────────────────────────────────

export function shuffle(items, rand = randomInt) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 새 배정. fixed 로 테스트용 고정 배정을 줄 수 있다.
 * @returns {{ cast: Record<'A'|'B'|'C'|'D', string>, victim: string }}
 */
export function newCasting(fixed = {}, rand = randomInt) {
  let cast;
  if (fixed.cast) {
    cast = { ...fixed.cast };
    const people = Object.values(cast).sort();
    if (roleIds.some(r => !characters[cast[r]]) || people.join() !== [...characterIds].sort().join()) {
      throw new Error('고정 배정이 올바르지 않습니다: ' + JSON.stringify(fixed.cast));
    }
  } else {
    const people = shuffle(characterIds, rand);
    cast = Object.fromEntries(roleIds.map((r, i) => [r, people[i]]));
  }
  const victim = fixed.victim ?? victims[rand(victims.length)];
  if (!victims.includes(victim)) throw new Error('피해자 후보가 아닙니다: ' + victim);
  return { cast, victim };
}

/** 고정 배정 환경변수 파싱. "A:kim,B:won,C:hwangyc,D:hwanggh" */
export function parseCast(text) {
  if (!text) return undefined;
  return Object.fromEntries(text.split(',').map(pair => pair.split(':').map(s => s.trim())));
}

export const roleOf = (cast, person) => roleIds.find(r => cast[r] === person) ?? null;

// ── 이름 치환 ────────────────────────────────────────────

const byName = (a, b) => a.localeCompare(b, 'ko');

/** 템플릿에 들어갈 변수. 목록은 항상 이름순으로 만들어 역할 순서가 드러나지 않게 한다. */
export function templateVars({ cast, victim }) {
  const vars = { victim };
  for (const r of roleIds) vars[r] = characters[cast[r]].name;
  const names = roleIds.map(r => vars[r]);
  vars.suspects = [...names].sort(byName).join(', ');
  vars.wireless = [vars.A, vars.C, vars.D].sort(byName).join(', ');
  const [w1, w2] = [vars.B, victim].sort(byName);
  vars.wired = fill('{x|과/와} {y}', { x: w1, y: w2 });
  const chatOrder = ['A', 'B', 'C'].sort((x, y) => byName(vars[x], vars[y]));
  vars.chatlog = [
    victim + ': ' + fill(scenario.chatMessages.victim, vars),
    ...chatOrder.map(r => vars[r] + ': ' + fill(scenario.chatMessages[r], vars))
  ].join('\n');
  return vars;
}

export function publicCase(game) {
  const vars = templateVars(game);
  return {
    intro: fill(scenario.intro, vars),
    victim: game.victim,
    clues: scenario.clues.map(c => ({ id: c.id, title: fill(c.title, vars), detail: fill(c.detail, vars) })),
    npcs: roleIds.map(r => game.cast[r]).sort((a, b) => byName(characters[a].name, characters[b].name))
      .map(id => ({ id, name: characters[id].name, summary: characters[id].summary }))
  };
}

export function revealCast(game) {
  const vars = templateVars(game);
  return roleIds.map(r => ({
    npc: game.cast[r], name: characters[game.cast[r]].name, role: r, title: fill(roles[r].title, vars)
  }));
}

/**
 * 장면의 한 곳을 조사했을 때 나오는 단서 카드 id. 사람마다 달라지는 곳(모니터)만 서버가 판정한다.
 * 빌드 기록은 범인(D) 자리의 모니터에서만 나온다. 그 밖의 곳은 null.
 */
export function clueAtSpot(game, spot) {
  const m = /^monitor-([a-z0-9_-]{1,40})$/.exec(spot);
  if (!m) return null;
  return game.cast[scenario.culprit] === m[1] ? 'build' : null;
}

export const truthText = game => fill(scenario.truth, templateVars(game));
export const motiveText = game => fill(scenario.motive, templateVars(game));

// ── 상태 기계 ────────────────────────────────────────────
// 역할별 상태: { unlocked: [factId], evidence: ['cite:x' | 'clue:x'] }
// - evidence 는 그 NPC에게 지금까지 첨부로 보여 준 것 (누적, 순서 무관). 사실의 필요 근거(needs) 확인에 쓴다
// - unlocked 는 단조 증가. 거짓말(cover)은 revokedBy 사실이 풀리면 "철회" 상태가 된다.

export function initialState() {
  return Object.fromEntries(roleIds.map(r => [r, {
    unlocked: roles[r].facts.filter(f => f.start).map(f => f.id),
    evidence: []
  }]));
}

/** 근거 조건식(needs)을 증거 원자 목록으로 평가한다. 원자: 'cite:<factId>' 'clue:<clueId>', 조합 all/any */
export function evaluate(cond, evidence) {
  if (cond == null) return true;
  if (typeof cond === 'string') return evidence.includes(cond);
  if (cond.all) return cond.all.every(c => evaluate(c, evidence));
  if (cond.any) return cond.any.some(c => evaluate(c, evidence));
  throw new Error('알 수 없는 조건: ' + JSON.stringify(cond));
}

/** 근거 조건식에 나오는 원자 목록 */
export function needAtoms(cond) {
  if (cond == null) return [];
  if (typeof cond === 'string') return [cond];
  return (cond.all ?? cond.any ?? []).flatMap(needAtoms);
}

export function isRevoked(fact, unlocked) {
  return (fact.revokedBy ?? []).some(id => unlocked.includes(id));
}

/** 프롬프트용으로 현재 상태를 나눈다. */
export function factView(roleId, state, newly = []) {
  const facts = roles[roleId].facts;
  const active = [], revoked = [], hidden = [], fresh = [];
  for (const f of facts) {
    if (state.unlocked.includes(f.id)) {
      if (isRevoked(f, state.unlocked)) revoked.push(f);
      else if (newly.includes(f.id)) fresh.push(f);
      else active.push(f);
    } else if (f.hint) {
      hidden.push(f);
    }
  }
  return { active, revoked, hidden, fresh };
}

/** 첨부를 증거 원자로 바꾼다. turnFacts 는 첨부한 턴에 태그된 사실 ID들. */
export function attachEvidence(attach, turnFacts = []) {
  if (!attach) return [];
  if (attach.type === 'clue') return ['clue:' + attach.id];
  return turnFacts.map(id => 'cite:' + id);
}

// ── 해금 판정 (빠른 모델의 기준 값 → 코드의 합산·비교) ─────────────
// 해금을 "결정"하는 것은 빠른 모델이 매긴 기준 값이다. 여기서는 그 값을 기계적으로 확인·합산·비교하고 기록만 한다.
// 기준: docs/game/AI_REDESIGN_DECISIONS.md 4장, 12장.

/** 한 메시지에 담을 수 있는 질문 수 */
export const MAX_QUESTIONS_PER_MESSAGE = 3;
/** 사실 성격별 해금선 (core 는 S1·S2 만점이 추가 조건) */
export const UNLOCK_LINE = { normal: 3, important: 4, core: 4 };

/** 차감 없는 응답(되묻기·반려)이 이만큼 연속되면 다음 응답은 1회 차감한다 */
export const FREE_STREAK_LIMIT = 3;

/**
 * 이번 응답이 질문을 몇 회 쓰는지 정한다.
 * - 답한 메시지: 센 질문 수만큼 차감, 연속 횟수 초기화
 * - 되묻기·반려·답변 실패: 차감 없음. 단 이미 연속 FREE_STREAK_LIMIT 번이었다면 1회 차감하고 초기화
 * - 남은 횟수 아래로는 차감하지 않는다
 * @returns {{ used: number, free: number, forced: boolean }} free = 갱신된 연속 횟수, forced = 무차감 응답인데 차감됨
 */
export function chargeFor({ answered, count = 0, free = 0, remaining = Infinity }) {
  if (answered) return { used: Math.min(count, remaining), free: 0, forced: false };
  if (free >= FREE_STREAK_LIMIT && remaining > 0) return { used: 1, free: 0, forced: true };
  return { used: 0, free: free + 1, forced: false };
}

/**
 * 메시지를 받기 전 상태 기준으로 사실마다 상태를 정한다 (판정 프롬프트의 가변 부분, 코드의 G1·근거 확인).
 * status: 'start'(처음부터 앎) | 'opened'(이미 털어놓음) | 'available'(해금 가능) | 'blocked'(앞 단계 미충족)
 * needsMet: 필요 근거가 이번 첨부 + 이 NPC에게 지난번에 보여 준 첨부에서 확인되는지
 */
export function factStatus(roleId, state, evidence = []) {
  const shown = [...new Set([...state.evidence, ...evidence])];
  return roles[roleId].facts.map(f => {
    const status = f.start ? 'start'
      : state.unlocked.includes(f.id) ? 'opened'
      : (f.after ?? []).every(id => state.unlocked.includes(id)) ? 'available' : 'blocked';
    return { id: f.id, status, needsMet: evaluate(f.needs, shown), missingAfter: (f.after ?? []).filter(id => !state.unlocked.includes(id)) };
  });
}

/**
 * 질문 하나의 판정 값을 코드 규칙으로 해석한다.
 * @param {object} q 모델 출력 { target, g2, g3, s1, basis, s2, s3, s4, kind }
 * @param {{ roleId, statuses, attached: boolean, grounded: boolean }} ctx statuses = factStatus(메시지 전 상태)
 */
export function scoreQuestion(q, { roleId, statuses, attached, grounded = true }) {
  const st = statuses.find(x => x.id === q.target && (x.status === 'available' || x.status === 'blocked'));
  // 형식 확인: S1=0 은 프롬프트 정의상 "무관하거나 target 이 none" 이므로 겨냥 사실이 없는 것으로 본다
  const fact = st && q.s1 > 0 ? roles[roleId].facts.find(f => f.id === st.id) : null;
  const g1 = fact ? st.status === 'available' : null;
  const g2 = attached ? q.g2 === 'yes' : null;
  const g3 = q.g3 === true;
  const s1 = fact ? q.s1 : 0;
  // 근거성(S2) 형식 확인 (4.2.1: 근거는 이번 첨부와 이 NPC와의 대화 기록뿐)
  // - 첨부도 대화 기록도 없거나, 모델이 근거 인용을 "없음"으로 적으면 0
  // - 겨냥 사실의 필요 근거가 이번 첨부·지난 첨부에서 확인되지 않으면 최대 1
  let s2 = !grounded || q.basis === '없음' ? 0 : q.s2;
  if (fact && !st.needsMet) s2 = Math.min(s2, 1);
  const total = s1 + s2 + q.s3 + q.s4;
  let outcome = 'none';
  if (fact && g1 && g2 !== false && g3) {
    const line = UNLOCK_LINE[fact.tier] ?? UNLOCK_LINE.normal;
    const pass = total >= line && (fact.tier !== 'core' || (s1 === 2 && s2 === 2));
    outcome = pass ? 'unlock' : 'near';
  }
  return { target: fact?.id ?? null, g1, g2, g3, s1, s2, s3: q.s3, s4: q.s4, total, outcome, kind: q.kind };
}

/**
 * 질문별 판정을 적용한다. 앞 단계(G1)와 근거 확인은 메시지를 받기 **전** 상태로 한 번만 계산한다
 * (메시지 안에서 앞 질문이 뒤 질문의 앞 단계를 만들어 주지 않는다. 연쇄 해금 없음).
 * 질문마다 겨냥 사실 하나라서 질문이 여러 개면 여러 사실이 풀릴 수 있다. 첨부 증거는 기록에 누적한다.
 * @returns {{ state, newly: string[], scored: object[], near: boolean }}
 */
export function applyJudgement(roleId, state, questions, { evidence = [], attached = false, grounded = true } = {}) {
  const statuses = factStatus(roleId, state, evidence);
  const next = {
    unlocked: [...state.unlocked],
    evidence: [...new Set([...state.evidence, ...evidence])]
  };
  const newly = [];
  const scored = questions.map(q => {
    const r = scoreQuestion(q, { roleId, statuses, attached, grounded });
    if (r.outcome === 'unlock' && !newly.includes(r.target)) {
      next.unlocked.push(r.target);
      newly.push(r.target);
    }
    return r;
  });
  const near = !newly.length && scored.some(s => s.outcome === 'near');
  return { state: next, newly, scored, near };
}

// ── 반복 실패 힌트 (6.3) ─────────────────────────────────
/** 같은 기준이 이만큼 연속 낮으면 그 기준의 힌트를 한 번 보여 준다 */
export const LOW_STREAK_LIMIT = 3;
/** 여러 기준이 동시에 차면 고르는 순서: 절대 기준 실패 → 점수가 낮은 기준 */
export const HINT_ORDER = ['G1', 'G2', 'G3', 'S4', 'S1', 'S2'];

/**
 * 한 메시지의 기준별 "낮음" 여부. 정상 판정이 돌아간 메시지에서만 부른다. 메시지 안의 질문 중 하나라도 낮으면 낮음(true).
 * 해당 없는 기준은 빠진다: 첨부가 없으면 G2, 사실을 겨누지 않으면 G1, G3를 통과하지 못했으면 S1(G3 쪽에서 센다).
 * 잡담 질문은 세지 않는다. 낮음: G1·G2·G3 실패, S1=0, S2=0, S4=-1 (S3는 보너스라 세지 않음)
 */
export function lowFlags(scored) {
  const flags = {};
  const mark = (key, applicable, low) => {
    if (applicable) flags[key] = (flags[key] ?? false) || low;
  };
  for (const s of scored.filter(x => x.kind !== 'chat')) {
    mark('G1', s.g1 !== null, s.g1 === false);
    mark('G2', s.g2 !== null, s.g2 === false);
    mark('G3', true, !s.g3);
    mark('S1', s.g3, s.s1 === 0);
    mark('S2', true, s.s2 === 0);
    mark('S4', true, s.s4 === -1);
  }
  return flags;
}

/**
 * 기준별 연속 낮음 횟수를 갱신한다. 낮으면 +1, 좋은 값이면 0, 해당 없으면 그대로.
 * 한도에 닿은 기준이 있으면 HINT_ORDER 순으로 하나만 골라 힌트로 쓰고 그 기준만 0으로 되돌린다.
 * @returns {{ lows: Record<string, number>, hint: string|null }}
 */
export function updateLows(lows = {}, flags = {}) {
  const next = { ...lows };
  for (const [key, low] of Object.entries(flags)) next[key] = low ? (next[key] ?? 0) + 1 : 0;
  const hint = HINT_ORDER.find(key => (next[key] ?? 0) >= LOW_STREAK_LIMIT) ?? null;
  if (hint) next[hint] = 0;
  return { lows: next, hint };
}
