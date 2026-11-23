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

export const truthText = game => fill(scenario.truth, templateVars(game));
export const motiveText = game => fill(scenario.motive, templateVars(game));

// ── 상태 기계 ────────────────────────────────────────────
// 역할별 상태: { unlocked: [factId], evidence: ['cite:x' | 'clue:x' | 'ask:x'] }
// - evidence 는 그 NPC에게 지금까지 보여 주거나 물은 것 (누적, 순서 무관)
// - unlocked 는 단조 증가. 거짓말(cover)은 revokedBy 사실이 풀리면 "철회" 상태가 된다.

export function initialState() {
  return Object.fromEntries(roleIds.map(r => [r, {
    unlocked: roles[r].facts.filter(f => f.start).map(f => f.id),
    evidence: []
  }]));
}

export function evaluate(cond, { unlocked, evidence }) {
  if (cond == null) return false;
  if (typeof cond === 'string') {
    const [kind, id] = cond.split(':');
    return kind === 'has' ? unlocked.includes(id) : evidence.includes(cond);
  }
  if (cond.all) return cond.all.every(c => evaluate(c, { unlocked, evidence }));
  if (cond.any) return cond.any.some(c => evaluate(c, { unlocked, evidence }));
  throw new Error('알 수 없는 조건: ' + JSON.stringify(cond));
}

/**
 * 증거를 추가하고 해금을 고정점까지 반복한다 (연쇄 해금 대비).
 * @returns {{ state, newly: string[] }} 원본 state 는 바꾸지 않는다.
 */
export function advance(roleId, state, addEvidence = []) {
  const next = {
    unlocked: [...state.unlocked],
    evidence: [...new Set([...state.evidence, ...addEvidence])]
  };
  const newly = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const fact of roles[roleId].facts) {
      if (next.unlocked.includes(fact.id) || !evaluate(fact.unlock, next)) continue;
      next.unlocked.push(fact.id);
      newly.push(fact.id);
      changed = true;
    }
  }
  return { state: next, newly };
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

/** 아직 잠긴 사실의 해금 조건에 등장하는 의도만 고른다 (분류 프롬프트를 짧게). */
export function openIntents(roleId, state) {
  const ids = new Set();
  const walk = cond => {
    if (typeof cond === 'string') { if (cond.startsWith('ask:')) ids.add(cond.slice(4)); }
    else if (cond) (cond.all ?? cond.any ?? []).forEach(walk);
  };
  for (const f of roles[roleId].facts) if (!state.unlocked.includes(f.id)) walk(f.unlock);
  return [...ids];
}

/** 첨부를 증거 원자로 바꾼다. turnFacts 는 첨부한 턴에 태그된 사실 ID들. */
export function attachEvidence(attach, turnFacts = []) {
  if (!attach) return [];
  if (attach.type === 'clue') return ['clue:' + attach.id];
  return turnFacts.map(id => 'cite:' + id);
}
