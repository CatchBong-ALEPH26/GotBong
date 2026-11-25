import { test } from 'node:test';
import assert from 'node:assert/strict';

// 자동 테스트는 실제 AI를 한 번도 부르지 않는다 (Fixture·가짜 모델만). 실제 AI 주소로 나가려 하면 바로 실패시킨다.
const guardedFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  if (/api\.openai\.com|generativelanguage\.googleapis\.com/.test(String(url))) throw new Error('테스트에서 실제 AI 호출 금지: ' + url);
  return guardedFetch(url, ...rest);
};
import { josa, fill, givenName } from '../lib/game/josa.mjs';
import {
  newCasting, initialState, applyJudgement, factView, publicCase, templateVars, roleOf, shuffle
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

// 모델 판정 한 질문 (기본: 해당 사실을 만점으로 겨눔)
const Q = (target, extra = {}) => ({ target, kind: 'case', g2: 'na', g3: true, s1: 2, basis: '근거', s2: 2, s3: 0, s4: 0, ...extra });

test('상태 기계: 해금은 단조, 거짓말은 철회, 앞 단계는 메시지 전 기록 기준(연쇄 없음)', () => {
  let s = initialState().D;
  assert.deepEqual([...s.unlocked].sort(), roles.D.facts.filter(f => f.start).map(f => f.id).sort());
  // 앞 단계(d_cable_excuse)가 안 풀렸으면 만점이어도 d_receiver 불가
  const blocked = applyJudgement('D', s, [Q('d_receiver')], { evidence: ['cite:c_cable', 'clue:receiver'], attached: true });
  assert.deepEqual(blocked.newly, []);
  assert.equal(blocked.scored[0].g1, false);
  // 한 메시지 안에서 앞 질문이 뒤 질문의 앞 단계를 만들어 주지 않는다
  const chain = applyJudgement('D', s, [Q('d_cable_excuse', { g2: 'yes' }), Q('d_receiver', { g2: 'yes' })], { evidence: ['cite:a_testimony'], attached: true });
  assert.deepEqual(chain.newly, ['d_cable_excuse']);
  s = chain.state;
  assert.ok(s.evidence.includes('cite:a_testimony'), '첨부 증거는 기록에 누적');
  // 이전 메시지에서 보여 준 수신기 단서도 필요 근거로 인정된다 (지난 첨부 기록)
  s = applyJudgement('D', s, [Q('none', { s1: 0 })], { evidence: ['clue:receiver'], attached: true }).state;
  const r2 = applyJudgement('D', s, [Q('d_receiver', { g2: 'yes' })], { evidence: ['cite:c_cable'], attached: true });
  assert.deepEqual(r2.newly, ['d_receiver']);
  const view = factView('D', r2.state, r2.newly);
  assert.ok(view.revoked.some(f => f.id === 'd_alibi'));
  assert.ok(view.revoked.some(f => f.id === 'd_cable_excuse'));
  assert.ok(view.fresh.some(f => f.id === 'd_receiver'));
  // 이미 풀린 사실은 다시 풀지 않는다
  assert.deepEqual(applyJudgement('D', r2.state, [Q('d_receiver')], {}).newly, []);
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
  // b_typing 의 필요 근거(빌드 기록)를 내밀며 묻는다. 근거 없이 물으면 근접에 그친다
  const b0 = await ask('B', `${templateVars(game).D}씨는 자리에서 뭐 하고 있었어요?`);
  assert.ok(!b0.facts.includes('b_typing'), '필요 근거 없이 물으면 풀리지 않는다');
  const b1 = await ask('B', '이 빌드 기록 보면 그때 자리에서 뭐 하고 있었어요?', clue('build'));
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

test('해금 판정: 점수 조합 예시 표(4.4)와 같은 결과 (일반·중요는 합계만, 핵심은 S1·S2 만점 + 합계 4)', () => {
  // 일반 b_source, 중요 a_testimony, 핵심 d_motive(앞 단계까지 풀린 상태). 필요 근거는 갖춘 것으로 둔다
  const st = (roleId, extra = []) => ({ unlocked: [...initialState()[roleId].unlocked, ...extra], evidence: ['clue:source', 'cite:d_points_a', 'clue:chat'] });
  const run = (roleId, target, [s1, s2, s3, s4], extra) =>
    applyJudgement(roleId, st(roleId, extra), [Q(target, { s1, s2, s3, s4 })]).scored[0].outcome;
  const core = ['d_cable_excuse', 'd_receiver', 'd_delete'];
  const table = [
    [[2, 2, 0, 0], 'unlock', 'unlock', 'unlock'],
    [[2, 1, 1, 0], 'unlock', 'unlock', 'near'],
    [[2, 0, 0, 0], 'near', 'near', 'near'],
    [[2, 2, 0, -1], 'unlock', 'near', 'near'],
    [[1, 1, 1, 0], 'unlock', 'near', 'near']
  ];
  for (const [scores, normal, important, coreOut] of table) {
    assert.equal(run('B', 'b_source', scores), normal, '일반 ' + scores);
    assert.equal(run('A', 'a_testimony', scores), important, '중요 ' + scores);
    assert.equal(run('D', 'd_motive', scores, core), coreOut, '핵심 ' + scores);
  }
});

test('해금 판정: 절대 기준(G1 앞 단계, G2 첨부 연결, G3 구체성)이 하나라도 실패하면 해금 불가, 형식 확인', () => {
  const B = { unlocked: initialState().B.unlocked, evidence: [] };
  const withSource = { evidence: ['clue:source'], attached: true };
  assert.deepEqual(applyJudgement('B', B, [Q('b_source', { g2: 'yes' })], withSource).newly, ['b_source']);
  // G2: 첨부가 있는데 질문이 첨부와 따로 놀면 불가 ("na"로 적어도 첨부가 있으면 실패)
  assert.deepEqual(applyJudgement('B', B, [Q('b_source', { g2: 'no' })], withSource).newly, []);
  assert.deepEqual(applyJudgement('B', B, [Q('b_source', { g2: 'na' })], withSource).newly, []);
  // G3: 포괄적인 질문
  assert.deepEqual(applyJudgement('B', B, [Q('b_source', { g3: false, g2: 'yes' })], withSource).newly, []);
  // 형식 확인: 처음부터 아는 사실·이미 풀린 사실·없는 사실은 고를 수 없다
  const opened = { unlocked: [...B.unlocked, 'b_source'], evidence: ['clue:source'] };
  for (const target of ['b_source', 'b_teacher', 'zzz']) {
    const r = applyJudgement('B', opened, [Q(target)]).scored[0];
    assert.equal(r.target, null, target);
    assert.equal(r.outcome, 'none');
  }
  // S1=0 은 "무관"이라 겨냥 사실이 없는 것으로 본다 (다른 점수로 해금선을 넘지 못함)
  const unrelated = applyJudgement('B', { ...B, evidence: ['clue:source'] }, [Q('b_source', { s1: 0, s3: 1 })]).scored[0];
  assert.equal(unrelated.target, null);
  assert.equal(unrelated.outcome, 'none');
});

test('근거성 형식 확인: 필요 근거가 없으면 S2 최대 1, 첨부·기록이 없거나 인용이 "없음"이면 0', () => {
  const B = initialState().B;
  // 필요 근거(소스 열람 기록)를 보여 준 적 없음 → S2 2 → 1: 일반 사실 (2,1)=3 해금, 중요 b_typing (2,1)=3 근접
  const noEvidence = applyJudgement('B', B, [Q('b_source'), Q('b_typing')]);
  assert.deepEqual(noEvidence.scored.map(x => x.s2), [1, 1]);
  assert.deepEqual(noEvidence.newly, ['b_source']);
  assert.equal(noEvidence.scored[1].outcome, 'near');
  // 핵심 사실은 필요 근거 없이는 만점이 될 수 없다
  const D = { unlocked: [...initialState().D.unlocked, 'd_cable_excuse', 'd_receiver', 'd_delete'], evidence: [] };
  assert.deepEqual(applyJudgement('D', D, [Q('d_motive', { s3: 1 })]).newly, []);
  assert.deepEqual(applyJudgement('D', D, [Q('d_motive', { g2: 'yes' })], { evidence: ['clue:chat'], attached: true }).newly, ['d_motive']);
  // 첨부도 기록도 없음, 또는 근거 인용 "없음"
  assert.equal(applyJudgement('B', B, [Q('b_record')], { grounded: false }).scored[0].s2, 0);
  assert.equal(applyJudgement('B', B, [Q('b_record', { basis: '없음' })]).scored[0].s2, 0);
  assert.equal(applyJudgement('B', B, [Q('b_record')]).scored[0].s2, 2, '필요 근거가 없는 사실은 깎지 않는다');
});

test('시나리오 데이터: 잠긴 사실마다 중요도·핵심 요소·근거 안내, 필요 근거·앞 단계는 실제 ID, 예전 조건 문법 없음', async () => {
  const { clueIds } = await import('../lib/game/data/case.mjs');
  const { needAtoms } = await import('../lib/game/game.mjs');
  const allFacts = roleIds.flatMap(r => roles[r].facts.map(f => f.id));
  for (const r of roleIds) {
    assert.equal(roles[r].intents, undefined, 'ask: 의도 목록 제거');
    for (const f of roles[r].facts) {
      assert.equal(f.unlock, undefined, f.id + ' 예전 조건 문법 제거');
      if (f.start) continue;
      assert.ok(['normal', 'important', 'core'].includes(f.tier), f.id);
      assert.ok(Array.isArray(f.elements) && f.elements.length >= 2, f.id);
      assert.ok(typeof f.basis === 'string' && f.basis.length > 10, f.id);
      assert.ok(f.keywords?.length, f.id + ' 테스트 모드 키워드');
      for (const id of f.after) assert.ok(roles[r].facts.some(x => x.id === id), f.id + ' 앞 단계 ' + id);
      for (const atom of needAtoms(f.needs)) {
        const [kind, id] = atom.split(':');
        assert.ok(kind === 'clue' ? clueIds.includes(id) : kind === 'cite' && allFacts.includes(id), f.id + ' 필요 근거 ' + atom);
      }
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
        assert.ok(req.system[0].includes('[대상의 사실 목록') && req.user.includes('[사실 상태'), '판정 입력: 사실 목록(고정) + 사실 상태(가변)');
        assert.ok(!(req.system.join('') + req.user).includes('범인은'), '판정 입력에 정답(진상 문서) 없음');
        return { value: judged, metric: {} };
      }
      return { value: task === 'draft' ? { reply: '대답', emotion: '기본' } : { pass: true, reason: '', disclosed: [] }, metric: {} };
    };
    const r = await runQuestion({ model, game, roleId: 'B', question: 'q', attach, history: [], remaining });
    return { r, order };
  };
  const one = await run(JUDGED('case', { target: 'b_source', g2: 'yes', g3: true, s1: 2, basis: '소스 열람 기록', s2: 2 }), 20, { type: 'clue', id: 'source', title: '소스 열람 기록' });
  assert.equal(one.r.debug.calls.length, 3);
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

test('구조화 출력: NPC 단위로 고정된 공통 스키마, 목록 밖 ID·범위 밖 점수·근거 인용 누락은 거부', async () => {
  const { checkSchema } = await import('../lib/ai/llm.mjs');
  const { fastSchema } = await import('../lib/ai/prompts.mjs');
  const schema = fastSchema('B');
  assert.equal(fastSchema('B'), schema, '같은 NPC면 같은 스키마 (질문마다 바뀌지 않음)');
  const wrap = q => ({ result: { task: 'judge', count_reason: '1', unclear: false, questions: [q] } });
  const ok = JUDGED('case', { target: 'b_source', s1: 2 }).questions[0];
  assert.ok(checkSchema(wrap(ok), schema));
  assert.ok(checkSchema(wrap({ ...ok, target: 'b_teacher' }), schema), '전체 ID 고정 (고를 수 있는지는 코드가 확인)');
  assert.ok(!checkSchema(wrap({ ...ok, target: 'd_receiver' }), schema), '다른 NPC의 사실 ID');
  assert.ok(!checkSchema(wrap({ ...ok, s1: 3 }), schema));
  assert.ok(!checkSchema(wrap({ ...ok, s4: 1 }), schema));
  assert.ok(!checkSchema(wrap({ ...ok, s2: '2' }), schema));
  const { basis, ...noBasis } = ok;
  assert.ok(basis !== undefined && !checkSchema(wrap(noBasis), schema), '근거 인용(basis) 필수');
  assert.ok(checkSchema({ result: { task: 'verify', reason: '통과', pass: true, disclosed: ['b_plagiarism'] } }, schema), '검증 갈래');
});

test('캐시 친화 배치: 판정·검증의 앞부분과 스키마가 같고 게임·NPC 동안 바뀌지 않으며, 가변 부분은 대화 기록부터', async () => {
  const requests = [];
  const model = async (task, req) => {
    requests.push({ task, ...req });
    const value = task === 'judge' ? JUDGED('case', { target: 'b_source', g2: 'yes', g3: true, s1: 2, basis: '기록', s2: 2 })
      : task === 'draft' ? { reply: '소스 파일을 열어 봤어요.', emotion: '기본' } : { result: { task: 'verify', reason: '통과', pass: true, disclosed: [] } };
    return { value, metric: {} };
  };
  const game = { id: 'g-1', cast: allCasts[0], victim: '곽도현', state: initialState() };
  const history = [];
  for (const q of ['이 기록 보세요', '그다음엔요?']) {
    const r = await runQuestion({ model, game, roleId: 'B', question: q, attach: { type: 'clue', id: 'source', title: '소스 열람 기록' }, history });
    game.state = { ...game.state, B: r.state };
    history.push({ question: q, reply: r.reply, attach: null });
  }
  const fast = requests.filter(r => r.task !== 'draft');
  assert.deepEqual(fast.map(r => r.task), ['judge', 'verify', 'judge', 'verify']);
  // 1) 판정·검증·두 번째 판정 모두 같은 첫 system 블록과 같은 스키마 객체
  assert.ok(fast.every(r => r.system[0] === fast[0].system[0]), '고정 앞부분 동일');
  assert.ok(fast.every(r => r.schema === fast[0].schema), '스키마 동일');
  assert.equal(new Set(requests.map(r => r.cacheKey)).size, 1, '같은 게임·NPC는 같은 캐시 키');
  // 2) 앞부분에는 상태가 없다 (해금 후에도 같음), 사실은 전부 고정 순서로
  assert.ok(roles.B.facts.every(f => fast[0].system[0].includes(`(${f.id})`)));
  assert.ok(!/해금 가능|이미 털어놓음|앞 단계 미충족/.test(fast[0].system[0]));
  // 3) 가변 부분은 대화 기록이 맨 앞이고, 다음 질문의 기록은 앞 질문 기록 뒤에 붙기만 한다
  const drafts = requests.filter(r => r.task === 'draft');
  assert.equal(drafts[0].system, drafts[1].system, '초안 system 고정');
  assert.ok(fast[2].user.startsWith('[대화 기록'), '판정 가변 부분은 대화 기록부터');
  const line1 = fast[2].user.split('\n')[1];
  assert.match(line1, /이 기록 보세요/);
  // 4) 키·시각 같은 바뀌는 값이 앞부분에 없다
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(fast[0].system.join('')));
});

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
  assert.deepEqual(lowFlags([vague]), { G3: true, S2: true, S4: false }, 'G3를 통과하지 못하면 S1은 세지 않는다');
  assert.equal(lowFlags([{ ...vague, g3: true }]).S1, true, '겨냥 사실 없이 G3 통과, S1=0 이면 낮음');
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
  assert.equal(lows.S2, 3, '나머지는 그대로');
  ({ lows, hint } = updateLows(lows, lowFlags([vague])));
  assert.equal(hint, 'S2');
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
