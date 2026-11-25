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
  // 근거(이 사람과의 대화 기록)가 생기도록 B가 먼저 말하게 한다. 첨부도 기록도 없으면 근거성은 0점이다
  await ask('B', '쉬는 시간에 어디 계셨어요?');
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

test('조사: 숫자·영문·끝 괄호', async () => {
  const { josa } = await import('../lib/game/josa.mjs');
  assert.equal(josa('3', '이/가'), '3이');
  assert.equal(josa('2', '이/가'), '2가');
  assert.equal(josa('1', '으로/로'), '1로');
  assert.equal(josa('원)', '은/는'), '원)은');
  assert.equal(josa('Kim', '이/가'), 'Kim이(가)');
});

test('질문 처리: 빈 답이나 너무 긴 답은 서버 오류가 아니라 반려 (질문 차감 없음)', async () => {
  const { runQuestion } = await import('../lib/ai/pipeline.mjs');
  const { initialState } = await import('../lib/game/game.mjs');
  const game = { cast: { A: 'kim', B: 'hwangyc', C: 'won', D: 'hwanggh' }, victim: '곽도현', state: initialState() };
  for (const reply of ['', 'x'.repeat(1300)]) {
    const model = async task => ({
      value: task === 'judge' ? JUDGED('case')
        : task === 'draft' ? { reply, emotion: '기본' }
        : { pass: true, reason: '', disclosed: [] },
      metric: {}
    });
    const r = await runQuestion({ model, game, roleId: 'A', question: '어디 계셨어요?', attach: null, history: [] });
    assert.equal(r.pass, false);
  }
});

test('질문 처리: 영문이 섞인 잡담 답은 검증을 건너뛰지 않는다', async () => {
  const { runQuestion } = await import('../lib/ai/pipeline.mjs');
  const { initialState } = await import('../lib/game/game.mjs');
  const game = { cast: { A: 'kim', B: 'hwangyc', C: 'won', D: 'hwanggh' }, victim: '곽도현', state: initialState() };
  let verified = 0;
  const model = async task => {
    if (task === 'verify') verified++;
    return {
      value: task === 'judge' ? JUDGED('chat')
        : task === 'draft' ? { reply: 'I plugged my receiver in.', emotion: '기본' }
        : { pass: false, reason: '누설', disclosed: [] },
      metric: {}
    };
  };
  const r = await runQuestion({ model, game, roleId: 'D', question: '점심 뭐 드셨어요?', attach: null, history: [] });
  assert.ok(verified > 0);
  assert.equal(r.pass, false);
});

// ── 해금 판정 (docs/game/AI_REDESIGN_DECISIONS.md 4장) ──────────────

function JUDGED(kind, extra = {}) {
  return {
    count_reason: '한 개', unclear: false,
    questions: [{ text: 'q', reason: 'r', kind, repeat: false, target: 'none', g2: 'na', g3: false, s1: 0, basis: '없음', s2: 0, s3: 0, s4: 0, ...extra }]
  };
}

test('해금 판정: 점수 조합 예시 표(4.4)와 같은 결과', async () => {
  const { scoreQuestion } = await import('../lib/game/game.mjs');
  // 일반 b_source, 중요 a_testimony, 핵심 d_motive(앞 단계 d_delete 가 풀린 상태)
  const ctx = (roleId, unlocked = []) => ({ roleId, unlocked: [...initialState()[roleId].unlocked, ...unlocked], attached: false });
  const run = (roleId, target, [s1, s2, s3, s4], unlocked) =>
    scoreQuestion({ target, g2: 'na', g3: true, s1, s2, s3, s4 }, ctx(roleId, unlocked)).outcome;
  const core = ['d_cable_excuse', 'd_receiver', 'd_delete'];
  const table = [
    [[2, 2, 0, 0], 'unlock', 'unlock', 'unlock'],
    [[2, 1, 1, 0], 'unlock', 'unlock', 'near'],
    [[2, 0, 0, 0], 'near', 'near', 'near'],
    [[2, 2, 0, -1], 'unlock', 'near', 'near']
  ];
  for (const [scores, normal, important, coreOut] of table) {
    assert.equal(run('B', 'b_source', scores), normal, '일반 ' + scores);
    assert.equal(run('A', 'a_testimony', scores), important, '중요 ' + scores);
    assert.equal(run('D', 'd_motive', scores, core), coreOut, '핵심 ' + scores);
  }
  // S1 이 0 이면 근접도 아니다
  assert.equal(run('B', 'b_source', [0, 2, 1, 0]), 'none');
});

test('해금 판정: 절대 기준(G1 앞 단계, G2 첨부 연결, G3 구체성)이 하나라도 실패하면 해금 불가', async () => {
  const { scoreQuestion } = await import('../lib/game/game.mjs');
  const full = { g2: 'na', g3: true, s1: 2, s2: 2, s3: 1, s4: 0 };
  const startD = initialState().D.unlocked;
  // G1: d_receiver 는 d_cable_excuse 가 먼저 풀려야 한다
  const g1 = scoreQuestion({ ...full, target: 'd_receiver' }, { roleId: 'D', unlocked: startD, attached: false });
  assert.equal(g1.g1, false);
  assert.equal(g1.outcome, 'none');
  assert.equal(scoreQuestion({ ...full, target: 'd_receiver' }, { roleId: 'D', unlocked: [...startD, 'd_cable_excuse'], attached: false }).outcome, 'unlock');
  // G2: 첨부가 있는데 질문이 첨부와 따로 놀면 불가
  assert.equal(scoreQuestion({ ...full, target: 'b_source', g2: 'no' }, { roleId: 'B', unlocked: [], attached: true }).outcome, 'none');
  assert.equal(scoreQuestion({ ...full, target: 'b_source', g2: 'yes' }, { roleId: 'B', unlocked: [], attached: true }).outcome, 'unlock');
  // G3: 포괄적인 질문
  assert.equal(scoreQuestion({ ...full, target: 'b_source', g3: false }, { roleId: 'B', unlocked: [], attached: false }).outcome, 'none');
  // 형식 검사: 이미 풀린 사실·처음부터 아는 사실·없는 사실은 고를 수 없다
  for (const target of ['b_source', 'b_teacher', 'zzz']) {
    const r = scoreQuestion({ ...full, target }, { roleId: 'B', unlocked: ['b_source'], attached: false });
    assert.equal(r.target, null, target);
    assert.equal(r.outcome, 'none');
  }
});

test('해금 판정: 모든 잠긴 사실에 중요도·핵심 요소·근거 안내가 있고, 앞 단계(after)는 예전 조건의 has: 와 같다', () => {
  const hasAtoms = cond => typeof cond === 'string' ? (cond.startsWith('has:') ? [cond.slice(4)] : [])
    : (cond?.all ?? cond?.any ?? []).flatMap(hasAtoms);
  for (const r of roleIds) {
    for (const f of roles[r].facts.filter(x => !x.start)) {
      assert.ok(['normal', 'important', 'core'].includes(f.tier), f.id);
      assert.ok(Array.isArray(f.elements) && f.elements.length >= 2, f.id);
      assert.ok(typeof f.basis === 'string' && f.basis.length > 10, f.id);
      assert.deepEqual([...f.after].sort(), hasAtoms(f.unlock).sort(), f.id);
    }
  }
  const tiers = Object.fromEntries(roleIds.flatMap(r => roles[r].facts.filter(x => !x.start).map(f => [f.id, f.tier])));
  assert.deepEqual(tiers, {
    a_testimony: 'important', a_receipt: 'normal', b_source: 'normal', b_record: 'normal', b_typing: 'important',
    c_why: 'normal', c_roulette: 'normal', c_cable: 'important',
    d_cable_excuse: 'normal', d_receiver: 'important', d_delete: 'core', d_motive: 'core'
  });
});

test('질문 처리: 판정을 먼저 기다리고 메인 모델은 한 번만, 반려·되묻기면 메인 모델을 부르지 않는다', async () => {
  const game = { cast: allCasts[0], victim: '곽도현', state: initialState() };
  const run = async (judged, remaining = 20, attach = null) => {
    const order = [];
    const model = async (task, req) => {
      order.push(task);
      if (task === 'judge') {
        assert.ok(req.user.includes('[잠긴 사실'), '판정 입력에 잠긴 사실');
        assert.ok(!req.user.includes('범인은'), '판정 입력에 정답(진상) 없음');
        return { value: judged, metric: {} };
      }
      return { value: task === 'draft' ? { reply: '대답', emotion: '기본' } : { pass: true, reason: '', disclosed: [] }, metric: {} };
    };
    const r = await runQuestion({ model, game, roleId: 'B', question: 'q', attach, history: [], remaining });
    return { r, order };
  };
  const one = await run(JUDGED('case', { target: 'b_source', g2: 'yes', g3: true, s1: 2, basis: '소스 열람 기록', s2: 2 }), 20, { type: 'clue', id: 'source', title: '소스 열람 기록' });
  assert.deepEqual(one.order, ['judge', 'draft', 'verify']);
  assert.ok(one.r.state.unlocked.includes('b_source'));
  assert.equal(one.r.count, 1);

  const unclear = await run({ count_reason: '', unclear: true, questions: [] });
  assert.equal(unclear.r.status, 'clarify');
  assert.deepEqual(unclear.order, ['judge']);

  const four = { count_reason: '4개', unclear: false, questions: Array(4).fill(JUDGED('case').questions[0]) };
  const tooMany = await run(four);
  assert.equal(tooMany.r.status, 'rejected');
  assert.equal(tooMany.r.reason, 'too_many');
  assert.deepEqual(tooMany.order, ['judge']);

  const two = { count_reason: '2개', unclear: false, questions: Array(2).fill(JUDGED('case').questions[0]) };
  const over = await run(two, 1);
  assert.equal(over.r.reason, 'over_remaining');
  assert.deepEqual(over.order, ['judge']);
});

test('질문 처리: 근접(해금선 미만, S1≥1)은 해금 없이 표정만 바뀐다', async () => {
  const game = { cast: allCasts[0], victim: '곽도현', state: initialState() };
  const model = async task => ({
    value: task === 'judge' ? JUDGED('case', { target: 'a_testimony', g3: true, s1: 1, s2: 1 })
      : task === 'draft' ? { reply: '복도에 있었어요.', emotion: '기본' } : { pass: true, reason: '', disclosed: [] },
    metric: {}
  });
  const r = await runQuestion({ model, game, roleId: 'A', question: '교실에 왔었죠', attach: null, history: [] });
  assert.equal(r.emotion, '당황');
  assert.ok(!r.state.unlocked.includes('a_testimony'));
});

test('구조화 출력 형식 검사: 목록 밖의 사실 ID·범위 밖 점수는 거부', async () => {
  const { checkSchema } = await import('../lib/ai/llm.mjs');
  const { judgeSchema } = await import('../lib/ai/prompts.mjs');
  const schema = judgeSchema(['b_source']);
  const ok = JUDGED('case', { target: 'b_source', s1: 2 });
  assert.ok(checkSchema(ok, schema));
  assert.ok(!checkSchema(JUDGED('case', { target: 'b_typing' }), schema));
  assert.ok(!checkSchema(JUDGED('case', { s1: 3 }), schema));
  assert.ok(!checkSchema(JUDGED('case', { s4: 1 }), schema));
  const { basis, ...noBasis } = ok.questions[0];
  assert.ok(basis && !checkSchema({ ...ok, questions: [noBasis] }, schema), '근거 인용(basis) 필수');
  assert.ok(!checkSchema({ ...ok, questions: [{ ...ok.questions[0], s2: '2' }] }, schema));
});

// ── 속마음 연출 (6장) ─────────────────────────────────────

test('속마음 힌트: 단서 이름·사실 내용·증거 위치·인물·정답 확인·점수가 들어가지 않는다', async () => {
  const { hints, thoughts } = await import('../lib/game/data/thoughts.mjs');
  const { characters } = await import('../lib/game/data/characters.mjs');
  const { clues, caseKeywords } = await import('../lib/game/data/case.mjs');
  const victimNames = victims;
  const people = [...Object.values(characters).map(c => c.name), ...victimNames];
  const givenNames = people.map(n => givenName(n)).filter(n => n.length >= 2);
  const clueWords = clues.flatMap(c => fill(c.title, { victim: '곽도현' }).split(/[\s()]+/)).filter(w => w.length >= 2 && !/^\d/.test(w));
  // 사실 문장에만 나오는 사건 고유어 (장소·물건·행동)
  const factWords = ['수신기', '휴지통', '빌드', '케이블', '룰렛', '소스', '본체', '키보드', '정수기', '자판기', '영수증', '기록지', '충전', '대화방', '시연', '복도', '강사', '교실', '모니터', '실행 파일', '보조배터리'];
  const confirm = ['맞다', '맞아', '맞는', '가깝', '가까', '정답', '방향', '점수', '근접', '범인', '거의 다', '조금만 더'];
  const banned = [...new Set([...people, ...givenNames, ...clueWords, ...caseKeywords, ...factWords, ...confirm])];
  for (const [key, list] of Object.entries(hints)) {
    assert.ok(list.length >= 3 && list.length <= 4, key + ' 변형 3~4개');
    for (const line of list) {
      for (const w of banned) assert.ok(!line.includes(w), `${key} 힌트에 금지어 "${w}": ${line}`);
      assert.ok(!/\d|[{}()]/.test(line), `${key} 힌트에 숫자·괄호: ${line}`);
    }
  }
  // 모든 속마음: 괄호 없이, 시스템 용어 없이, 상황별 3~4개
  for (const [key, list] of Object.entries(thoughts)) {
    assert.ok(list.length >= 3 && list.length <= 4, key + ' 변형 3~4개');
    for (const line of list) {
      assert.ok(!/[()]/.test(line), key + ' 괄호: ' + line);
      assert.ok(!/오류|서버|횟수 초과|제한|에러|세션|요청|API|AI/.test(line), key + ' 시스템 용어: ' + line);
    }
  }
});

test('반복 실패 힌트: 같은 기준이 게임 단위로 연속 3번 낮으면 한 번, 좋은 점수면 초기화, 동시면 하나만', async () => {
  const { lowFlags, updateLows } = await import('../lib/game/game.mjs');
  const vague = { kind: 'case', g1: null, g2: null, g3: false, s1: 0, s2: 0, s4: 0 };
  const good = { kind: 'case', g1: true, g2: null, g3: true, s1: 2, s2: 2, s4: 0 };
  const chat = { kind: 'chat', g1: null, g2: null, g3: false, s1: 0, s2: 0, s4: 0 };
  assert.deepEqual(lowFlags([chat]), {}, '잡담은 세지 않는다');
  assert.deepEqual(lowFlags([vague]), { G3: true, S1: true, S2: true, S4: false });
  // 메시지 안의 질문 중 하나라도 낮으면 그 메시지는 낮음 (한 메시지는 1회)
  assert.equal(lowFlags([good, vague]).S2, true);

  let lows = {};
  let hint;
  ({ lows, hint } = updateLows(lows, lowFlags([vague])));
  ({ lows, hint } = updateLows(lows, lowFlags([vague])));
  assert.equal(hint, null);
  ({ lows, hint } = updateLows(lows, lowFlags([vague])));
  assert.equal(hint, 'G3', '동시에 차면 절대 기준이 먼저, 하나만');
  assert.equal(lows.G3, 0, '보여 준 기준은 0으로');
  assert.equal(lows.S1, 3, '나머지는 그대로');
  ({ lows, hint } = updateLows(lows, lowFlags([vague])));
  assert.equal(hint, 'S1');
  // 좋은 점수를 받으면 그 기준은 초기화
  ({ lows } = updateLows({ S2: 2, S4: 2 }, lowFlags([good])));
  assert.equal(lows.S2, 0);
  assert.equal(lows.S4, 0);
  // 유도형은 점수가 가장 낮은 기준이라 S1·S2 보다 먼저
  ({ hint } = updateLows({ S1: 2, S2: 2, S4: 2 }, { S1: true, S2: true, S4: true }));
  assert.equal(hint, 'S4');
  // 해당 없는 기준(첨부 없을 때 G2)은 그대로
  ({ lows } = updateLows({ G2: 2 }, lowFlags([good])));
  assert.equal(lows.G2, 2);
});

test('근거성 형식 확인: 첨부도 대화 기록도 없거나 근거 인용이 "없음"이면 S2는 0으로 본다', async () => {
  const { applyJudgement } = await import('../lib/game/game.mjs');
  const q = { target: 'b_source', kind: 'case', g2: 'na', g3: true, s1: 2, basis: '기록에서', s2: 2, s3: 0, s4: 0 };
  const B = initialState().B;
  assert.deepEqual(applyJudgement('B', B, [q], { grounded: true }).newly, ['b_source']);
  assert.deepEqual(applyJudgement('B', B, [q], { grounded: false }).newly, [], '근거 없이 정확히 맞혀도 근접까지만');
  assert.equal(applyJudgement('B', B, [q], { grounded: false }).near, true);
  assert.deepEqual(applyJudgement('B', B, [{ ...q, basis: '없음' }], { grounded: true }).newly, []);
});
