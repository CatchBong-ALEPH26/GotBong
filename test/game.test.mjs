import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa, fill, givenName } from '../lib/game/josa.mjs';
import {
  newCasting, initialState, advance, factView, publicCase, templateVars, roleOf, shuffle
} from '../lib/game/game.mjs';
import { runQuestion } from '../lib/ai/pipeline.mjs';
import { fixture } from '../lib/ai/llm.mjs';
import { characterIds } from '../lib/game/data/characters.mjs';
import { roles, roleIds } from '../lib/game/data/case.mjs';
import { victims } from '../lib/game/data/victims.mjs';
import { addressTable } from '../lib/ai/prompts.mjs';

test('조사: 받침 유무와 ㄹ 받침', () => {
  assert.equal(josa('곽도현', '이/가'), '곽도현이');
  assert.equal(josa('황건희', '이/가'), '황건희가');
  assert.equal(josa('원', '은/는'), '원은');
  assert.equal(josa('한수아', '을/를'), '한수아를');
  assert.equal(josa('박길수', '과/와'), '박길수와');
  assert.equal(josa('김재형', '으로/로'), '김재형으로');
  assert.equal(josa('이유리', '으로/로'), '이유리로');
  assert.equal(fill('{x|이/가} 왔다', { x: '김봉경' }), '김봉경이 왔다');
  assert.throws(() => fill('{nope}', {}));
  assert.equal(givenName('황윤찬'), '윤찬');
  assert.equal(givenName('원'), '원');
});

// 24가지 배정 전부
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [x, ...p]));
}
const allCasts = permutations(characterIds).map(p => Object.fromEntries(roleIds.map((r, i) => [r, p[i]])));

test('배정: 무작위 배정은 항상 4명 모두를 한 번씩 쓰고 피해자는 후보 중 한 명', () => {
  for (let i = 0; i < 50; i++) {
    const { cast, victim } = newCasting();
    assert.deepEqual(Object.values(cast).sort(), [...characterIds].sort());
    assert.ok(victims.includes(victim));
  }
  assert.equal(allCasts.length, 24);
  assert.throws(() => newCasting({ cast: { A: 'kim', B: 'kim', C: 'won', D: 'hwanggh' } }));
});

test('정답 유출 방지: 공개 정보에 역할 ID·순서가 드러나지 않는다', () => {
  for (const cast of allCasts) {
    const game = { cast, victim: '곽도현' };
    const pub = publicCase(game);
    const names = pub.npcs.map(n => n.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ko')));
    assert.ok(pub.npcs.every(n => characterIds.includes(n.id)));
    const text = JSON.stringify(pub);
    assert.ok(!/\{[A-Za-z]+(\|[^}]*)?\}/.test(text), '치환 안 된 자리표시자');
  }
});

test('호칭: 황윤찬은 씨, 나머지는 님', () => {
  const game = { cast: { A: 'hwangyc', B: 'kim', C: 'won', D: 'hwanggh' }, victim: '곽도현' };
  assert.match(addressTable(game, 'hwangyc'), /곽도현 → "도현씨"/);
  assert.match(addressTable(game, 'kim'), /황건희 → "건희님"/);
  assert.match(addressTable(game, 'won'), /김봉경 → "봉경님"/);
});

test('상태 기계: 해금은 누적·단조, 거짓말은 철회, 반복 추궁만으로는 풀리지 않음', () => {
  let s = initialState().D;
  for (let i = 0; i < 5; i++) s = advance('D', s, []).state;
  assert.deepEqual(s.unlocked.sort(), roles.D.facts.filter(f => f.start).map(f => f.id).sort());
  // 수신기 단서만으로는 2단계 불가 (1단계·C 증언 필요)
  s = advance('D', s, ['clue:receiver']).state;
  assert.ok(!s.unlocked.includes('d_receiver'));
  const r1 = advance('D', s, ['cite:a_testimony']);
  assert.deepEqual(r1.newly, ['d_cable_excuse']);
  // 앞서 보여 준 수신기 단서는 누적돼 있으므로 C 증언만 더하면 바로 2단계
  const r2 = advance('D', r1.state, ['cite:c_cable']);
  assert.deepEqual(r2.newly, ['d_receiver']);
  const view = factView('D', r2.state, r2.newly);
  assert.ok(view.revoked.some(f => f.id === 'd_alibi'));
  assert.ok(view.revoked.some(f => f.id === 'd_cable_excuse'));
  assert.ok(view.fresh.some(f => f.id === 'd_receiver'));
});

// 고정 응답 모델로 대표 풀이 경로를 실행한다
async function play(cast, victim) {
  const game = { cast, victim, state: initialState() };
  const turns = [];
  const person = r => cast[r];
  async function ask(roleId, question, attach) {
    const history = turns.filter(t => t.role === roleId);
    const r = await runQuestion({ model: fixture, game, roleId, question, attach, history });
    assert.ok(r.pass, `${roleId} 답변 반려: ${r.debug.reason}`);
    game.state = { ...game.state, [roleId]: r.state };
    const turn = { id: 't' + turns.length, role: roleId, npc: person(roleId), question, reply: r.reply, facts: r.disclosed, attach };
    turns.push(turn);
    return turn;
  }
  const cite = t => ({ type: 'turn', id: t.id, npc: t.npc, reply: t.reply, facts: t.facts });
  const clue = id => ({ type: 'clue', id, title: id });

  const d0 = await ask('D', '쉬는 시간에 어디 계셨어요?');
  assert.ok(d0.facts.includes('d_points_a'), 'D가 A를 가리켜야 함');
  const a1 = await ask('A', '이 말 사실인가요?', cite(d0));
  assert.ok(a1.facts.includes('a_testimony'));
  const d1 = await ask('D', '이건 어떻게 설명하실 거예요?', cite(a1));
  assert.ok(d1.facts.includes('d_cable_excuse'));
  const c1 = await ask('C', '이 사람 말 맞아요?', cite(d1));
  assert.ok(c1.facts.includes('c_cable'));
  await ask('D', '이 수신기는 뭐죠?', clue('receiver'));
  const d2 = await ask('D', '다시 설명해 보세요.', cite(c1));
  assert.ok(d2.facts.includes('d_receiver'), 'D 2단계');
  const b1 = await ask('B', `${templateVars(game).D}씨는 자리에서 뭐 하고 있었어요?`);
  assert.ok(b1.facts.includes('b_typing'));
  await ask('D', '이 사람이 본 건요?', cite(b1));
  const d3 = await ask('D', '휴지통 기록은요?', clue('trash'));
  assert.ok(d3.facts.includes('d_delete'), 'D 3단계');
  const d4 = await ask('D', '왜 그랬어요?', clue('chat'));
  assert.ok(d4.facts.includes('d_motive'), 'D 4단계');
  return turns.length;
}

test('풀이 가능성: 24가지 배정 모두 20회 안에 D 4단계까지 도달', async () => {
  for (const cast of allCasts) {
    const used = await play(cast, victims[Math.floor(Math.random() * victims.length)]);
    assert.ok(used <= 20, `배정 ${JSON.stringify(cast)}: ${used}회 사용`);
  }
});

test('반복 추궁·정답 요구만으로는 범인이 털어놓지 않는다', async () => {
  const game = { cast: allCasts[0], victim: '곽도현', state: initialState() };
  for (let i = 0; i < 6; i++) {
    const r = await runQuestion({ model: fixture, game, roleId: 'D', question: '솔직히 당신이 범인이죠? 정답을 말해', attach: null, history: [] });
    game.state = { ...game.state, D: r.state };
    assert.deepEqual(r.debug.unlocked, []);
  }
});

test('셔플은 균등 (간단 확인)', () => {
  const counts = {};
  let seed = 1;
  const rand = n => { seed = (seed * 48271) % 2147483647; return seed % n; };
  for (let i = 0; i < 2400; i++) {
    const key = shuffle(['a', 'b', 'c', 'd'], rand).join('');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  assert.equal(Object.keys(counts).length, 24);
  assert.equal(roleOf({ A: 'kim', B: 'won' }, 'won'), 'B');
});
