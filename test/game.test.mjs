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
  newCasting, initialState, applyJudgement, factView, publicCase, templateVars, roleOf, shuffle, lowFlags, progressOf
} from '../lib/game/game.mjs';
import { runQuestion } from '../lib/ai/pipeline.mjs';
import { fixture } from '../lib/ai/llm.mjs';
import { characterIds, characters, SITUATIONS, AUDIENCES } from '../lib/game/data/characters.mjs';
import { roles, roleIds } from '../lib/game/data/case.mjs';
import { ALIBIS, FIXED_VICTIM, availableFacts, getMaterial, scoreGrade } from '../lib/game/data/ransomware.mjs';
import { victims } from '../lib/game/data/victims.mjs';
import { addressTable, characterBlock } from '../lib/ai/prompts.mjs';

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
// v3.6: 인물 배정 24가지 × 알리바이 A/B = 48가지 사건 조합
const allCombos = allCasts.flatMap(cast => ALIBIS.map(alibi => ({ ...cast, _alibi: alibi })));

test('배정: 무작위 배정은 항상 4명 모두를 한 번씩 쓰고, 피해자는 고정, 알리바이는 A/B 중 하나', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const { cast, victim } = newCasting();
    assert.deepEqual(roleIds.map(r => cast[r]).sort(), [...characterIds].sort());
    assert.ok(ALIBIS.includes(cast._alibi));
    assert.equal(victim, FIXED_VICTIM);
    seen.add(cast._alibi);
  }
  assert.deepEqual([...seen].sort(), ['A', 'B'], '두 갈래 모두 나온다');
  assert.equal(allCasts.length, 24);
  assert.equal(allCombos.length, 48);
  assert.throws(() => newCasting({ cast: { A: 'kim', B: 'kim', C: 'won', D: 'hwanggh' } }));
  assert.throws(() => newCasting({ cast: allCasts[0], alibi: 'C' }));
  assert.equal(newCasting({ cast: allCasts[0], alibi: 'B' }).cast._alibi, 'B');
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

test('48가지 조합: 이름 치환·진상·동기·범인 역할이 맞고, 각 NPC 프롬프트에 다른 갈래 사실이 없다', async () => {
  const { draftSystem, fastPrefix } = await import('../lib/ai/prompts.mjs');
  const { truthText, motiveText, revealCast } = await import('../lib/game/game.mjs');
  const placeholder = /\{[A-Za-z]+(\|[^}]*)?\}/;
  for (const cast of allCombos) {
    const game = { cast, victim: FIXED_VICTIM, state: initialState(cast._alibi) };
    const vars = templateVars(game);
    assert.equal(roleOf(cast, cast.D), 'D');
    const pub = JSON.stringify(publicCase(game));
    assert.ok(!placeholder.test(pub), '공개 정보 자리표시자');
    assert.ok(!publicCase(game).clues.some(c => c.detail), '찾기 전 단서 내용 없음');
    const truth = truthText(game);
    assert.ok(!placeholder.test(truth) && truth.includes(vars.D), '진상 치환');
    assert.equal(truth.includes('포폴을 고친다'), cast._alibi === 'B', '진상은 이 게임의 갈래만 설명');
    assert.ok(!placeholder.test(motiveText(game)));
    assert.deepEqual(revealCast(game).filter(c => c.culprit).map(c => c.npc), [cast.D]);
    // 두 갈래에 같은 문장인 사실(3단계·동기)은 제외하고, 다른 갈래에만 있는 문장을 찾는다
    const ownSays = new Set(roleIds.flatMap(r => availableFacts(r, cast._alibi).map(f => fill(f.say, vars))));
    const otherSays = roleIds.flatMap(r => roles[r].facts.filter(f => f.branch && f.branch !== cast._alibi).map(f => fill(f.say, vars))).filter(x => !ownSays.has(x));
    assert.ok(otherSays.length >= 5, '다른 갈래에만 있는 사실이 실제로 검사된다');
    for (const r of roleIds) {
      const text = draftSystem(game, r) + fastPrefix(game, r);
      for (const say of otherSays) assert.ok(!text.includes(say), `${cast._alibi} 갈래 ${r} 프롬프트에 다른 갈래 사실: ${say.slice(0, 30)}`);
    }
  }
});

test('호칭: 윤찬은 씨, 나머지는 님', () => {
  const game = { cast: { A: 'hwangyc', B: 'kim', C: 'won', D: 'hwanggh' }, victim: '곽도현' };
  assert.match(addressTable(game, 'hwangyc'), /곽도현 → "도현씨"/);
  assert.match(addressTable(game, 'kim'), /건희 → "건희님"/);
  assert.match(addressTable(game, 'won'), /봉경 → "봉경님"/);
});

// 모델 판정 한 질문 (기본: 해당 사실을 만점으로 겨눔)
const Q = (target, extra = {}) => ({ target, kind: 'case', g2: 'na', g3: true, s1: 2, basis: '근거', s2: 2, s3: 0, s4: 0, ...extra });

test('상태 기계: 해금은 단조, 거짓말은 철회, 앞 단계는 메시지 전 기록 기준(연쇄 없음), 건너뛴 단계는 함께 해결', () => {
  let s = initialState('A').D;
  assert.deepEqual([...s.unlocked].sort(), availableFacts('D', 'A').filter(f => f.start).map(f => f.id).sort());
  // 앞 단계(d_stage3_a)가 안 풀렸으면 근거를 다 갖춰도 동기(d_motive_a) 불가
  const blocked = applyJudgement('D', s, [Q('d_motive_a')], { evidence: ['clue:mentoring', 'clue:message'], attached: true });
  assert.deepEqual(blocked.newly, []);
  assert.equal(blocked.scored[0].g1, false);
  // 한 메시지 안에서 앞 질문이 뒤 질문의 앞 단계를 만들어 주지 않는다
  const chain = applyJudgement('D', s, [Q('d_stage1_a', { g2: 'yes' }), Q('d_motive_a', { g2: 'yes' })], { evidence: ['cite:a_lunch_a'], attached: true });
  assert.deepEqual(chain.newly, ['d_stage1_a']);
  s = chain.state;
  assert.ok(s.evidence.includes('cite:a_lunch_a'), '첨부 증거는 기록에 누적');
  // 이전 메시지에서 보여 준 단서도 필요 근거로 인정된다 (지난 첨부 기록)
  s = applyJudgement('D', s, [Q('none', { s1: 0 })], { evidence: ['clue:shortcut'], attached: true }).state;
  s = applyJudgement('D', s, [Q('none', { s1: 0 })], { evidence: ['clue:usblog'], attached: true }).state;
  // 3단계를 바로 깨면 건너뛴 2단계도 함께 해결 (시나리오 7.1)
  const r2 = applyJudgement('D', s, [Q('d_stage3_a', { g2: 'yes' })], { evidence: ['cite:c_witness_a'], attached: true });
  assert.deepEqual(r2.newly, ['d_stage3_a', 'd_stage2_a']);
  const view = factView('D', r2.state, r2.newly);
  assert.ok(view.revoked.some(f => f.id === 'd_alibi_a'));
  assert.ok(view.fresh.some(f => f.id === 'd_stage3_a'));
  // 이미 풀린 사실은 다시 풀지 않는다
  assert.deepEqual(applyJudgement('D', r2.state, [Q('d_stage3_a')], {}).newly, []);
});

test('알리바이 갈래: 질문을 거듭해도 갈래가 유지되고 다른 갈래 사실은 상태·프롬프트에 섞이지 않는다', () => {
  for (const branch of ALIBIS) {
    const other = branch === 'A' ? '_b' : '_a';
    let st = initialState(branch);
    for (const r of roleIds) {
      // 판정을 여러 번 적용해도 갈래를 잃지 않는다 (예전에는 첫 질문 뒤 A 로 바뀌었다)
      for (let i = 0; i < 3; i++) st = { ...st, [r]: applyJudgement(r, st[r], [Q('none', { s1: 0 })]).state };
      assert.equal(st[r].branch, branch, r + ' 갈래 유지');
      const v = factView(r, st[r]);
      const ids = [...v.active, ...v.revoked, ...v.hidden].map(f => f.id);
      assert.ok(!ids.some(id => id.endsWith(other)), `${branch} 갈래 ${r}에 다른 갈래 사실: ${ids}`);
    }
  }
});

// 고정 응답 모델로 시나리오 8절 대표 풀이 경로를 실행한다 (한 메시지에 첨부는 하나)
async function play(cast) {
  const branch = cast._alibi;
  const b = branch.toLowerCase();
  const game = { cast, victim: FIXED_VICTIM, state: initialState(branch), cluesFound: ['shortcut', 'usblog', 'mentoring', 'usb'] };
  const vars = templateVars(game);
  const turns = [];
  const materialsShown = [];
  let charged = 0;
  const other = branch === 'A' ? '_b' : '_a';
  async function ask(roleId, question, attach) {
    const history = turns.filter(t => t.role === roleId);
    const r = await runQuestion({ model: fixture, game, roleId, question, attach, history, remaining: 20 - charged });
    assert.equal(r.status, 'answered', `${roleId} "${question}" ${r.status} ${r.reason ?? ''}`);
    assert.ok(r.pass, `${roleId} 답변 반려: ${r.debug.reason}`);
    charged += r.count;
    assert.ok(!r.disclosed.some(id => id.endsWith(other)), `${branch} 갈래에 다른 갈래 사실 공개: ${r.disclosed}`);
    game.state = { ...game.state, [roleId]: r.state };
    const m = getMaterial(r.disclosed, branch, vars, fill, materialsShown);
    if (m) materialsShown.push(m.id);
    const turn = { id: 't' + turns.length, role: roleId, npc: cast[roleId], question, reply: r.reply, facts: r.disclosed, attach, material: m };
    turns.push(turn);
    return turn;
  }
  const cite = t => ({ type: 'turn', id: t.id, npc: t.npc, reply: t.reply, facts: t.facts });
  const clue = id => ({ type: 'clue', id, title: id });
  const has = (t, id, msg) => assert.ok(t.facts.includes(id), msg ?? id);

  const a1 = await ask('A', '1시쯤 어디 있었어요?');
  has(a1, 'a_lunch_' + b); has(a1, 'a_receipt_' + b);
  assert.equal(a1.material?.id, 'receipt', '영수증 자료');
  if (branch === 'A') {
    has(await ask('D', '이 말은 어떻게 설명하실 거예요?', cite(a1)), 'd_stage1_a', 'M01-A');
    const c1 = await ask('C', '이 기록 보면 USB 찾으러 갔던 거죠?', clue('usblog'));
    has(c1, 'c_witness_a');
    has(await ask('D', '이 사람이 본 건요?', cite(c1)), 'd_stage2_a', 'M02');
  } else {
    const b1 = await ask('B', '1시쯤 어디 있었어요?');
    has(b1, 'b_studylog');
    assert.equal(b1.material?.id, 'studylog', '자습실 이용 기록 자료');
    const b2 = await ask('B', '1시 반쯤 외출해서 화장실 가면서 뭐 봤어요?');
    has(b2, 'b_witness', 'O02');
    const dLunch = await ask('D', '1시쯤 어디 있었어요?');
    assert.ok(!dLunch.material, '저장 기록은 보여 달라고 하기 전에는 나오지 않는다');
    // 저장 기록을 보기 전에는 빈자리 증언만으로 저장 기록의 공백을 짚을 수 없다 (M01-B 는 둘 다 필요)
    assert.ok(!(await ask('D', '이 사람은 자리가 비어 있었다는데요?', cite(b2))).facts.includes('d_stage1_b'), '저장 기록 없이 M01-B 불가');
    const d0 = await ask('D', '포폴 저장 기록 보여 줄 수 있어요?');
    has(d0, 'd_savelog_b');
    assert.equal(d0.material?.id, 'savelog', '포폴 저장 기록 자료 (B만)');
    has(await ask('D', '저장 기록 사이에 자리 비웠던 거 맞죠?'), 'd_stage1_b', 'M01-B');
    const c1 = await ask('C', '이 기록 보면 USB 찾으러 갔던 거죠?', clue('usblog'));
    has(c1, 'c_witness_b');
    assert.ok(!c1.reply.includes(vars.D + '와 마주쳤'), 'B 갈래 목격자는 얼굴을 모른다');
    // 뒷모습 목격 + 나머지 세 명의 알리바이가 모두 있어야 2단계가 깨진다
    const d2 = await ask('D', '이 사람이 본 뒷모습은요?', cite(c1));
    assert.ok(!d2.facts.includes('d_stage2_b'), '알리바이 없이 뒷모습만으로는 깨지지 않는다');
    await ask('D', '이 사람들은 식당에 있었어요.', cite(a1));
    has(await ask('D', '이 사람은 자습실에 있었어요.', cite(b1)), 'd_stage2_b', 'M02');
  }
  const d3a = await ask('D', '이 기록은요?', clue('usblog'));
  assert.ok(!d3a.facts.includes('d_stage3_' + b), '바로가기 속성 없이 3단계는 깨지지 않는다');
  has(await ask('D', '이 바로가기는요?', clue('shortcut')), 'd_stage3_' + b, 'M03');
  const a2 = await ask('A', '멘토링 이야기 좀 해 주세요.', clue('mentoring'));
  has(a2, 'a_message', '푸념 메시지 획득');
  game.cluesFound.push('message');
  await ask('D', '멘토링은요?', clue('mentoring'));
  has(await ask('D', '이 메시지는 왜 보냈어요?', clue('message')), 'd_motive_' + b, 'M04');
  has(await ask('C', '이 USB는 왜 비어 있어요?', clue('usb')), 'c_usb_reason', 'O01');
  if (branch === 'A') {
    const b1 = await ask('B', '1시쯤 어디 있었어요?');
    assert.ok(!b1.facts.includes('b_witness'), '첫 대화에서는 외출 때 본 것을 말하지 않는다');
    has(await ask('B', '1시 반쯤 외출해서 화장실 가면서 뭐 봤어요?'), 'b_witness', 'O02');
  }

  const solved = progressOf(game.state).solved.map(x => x.id);
  assert.deepEqual([...new Set(solved)].sort(), ['M01-' + branch, 'M02', 'M03', 'M04', 'O01', 'O02'].sort());
  assert.equal(progressOf(game.state).total, 6);
  assert.equal(scoreGrade(true, solved), 'S');
  return charged;
}

test('풀이 가능성: 48가지 사건 조합 모두 20회 안에 핵심 4개·선택 2개를 풀고 갈래가 섞이지 않는다', async () => {
  for (const cast of allCombos) {
    const used = await play(cast);
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

test('질문 처리: 말버릇 앙케이트의 설명 글("본론만 이야기함" 등)을 대사로 옮기면 한 번 다시 만들고, 고쳐지면 그 답을 쓴다', async () => {
  const { runQuestion } = await import('../lib/ai/pipeline.mjs');
  const { initialState } = await import('../lib/game/game.mjs');
  const game = { cast: { A: 'kim', B: 'hwangyc', C: 'won', D: 'hwanggh' }, victim: '곽도현', state: initialState() };
  const drafts = ['본론만 이야기함. 식당에 있었어요.', '식당에 있었어요.'];
  const prompts = [];
  const model = async (task, req) => {
    if (task === 'draft') prompts.push(req.user);
    return {
      value: task === 'judge' ? JUDGED('case')
        : task === 'draft' ? { reply: drafts[prompts.length - 1], emotion: '기본' }
        : { result: { task: 'verify', reason: '통과', pass: true, disclosed: [] } },
      metric: {}
    };
  };
  const r = await runQuestion({ model, game, roleId: 'C', question: '점심시간에 어디 계셨어요?', attach: null, history: [] });
  assert.equal(prompts.length, 2, '한 번 다시 만든다');
  assert.match(prompts[1], /본론만 이야기함/, '반려 이유를 알려 준다');
  assert.equal(r.reply, '식당에 있었어요.');
  assert.equal(r.pass, true);
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

test('B 갈래 2단계: 뒷모습 목격 + 식당(증언 또는 영수증) + 자습실 기록 + 빈자리 증언, 저장 기록을 본 뒤에만', () => {
  const D0 = initialState('B').D;
  const base = ['cite:c_witness_b', 'cite:b_studylog', 'cite:b_witness'];
  const withLog = { ...D0, unlocked: [...D0.unlocked, 'd_savelog_b'] };
  for (const lunch of ['cite:a_lunch_b', 'cite:a_receipt_b']) {
    assert.deepEqual(applyJudgement('D', { ...withLog, evidence: [...base, lunch] }, [Q('d_stage2_b')]).newly, ['d_stage2_b', 'd_stage1_b'], lunch);
  }
  assert.deepEqual(applyJudgement('D', { ...withLog, evidence: base }, [Q('d_stage2_b')]).newly, [], '식당 알리바이 근거 없이 불가');
  assert.deepEqual(applyJudgement('D', { ...D0, evidence: [...base, 'cite:a_receipt_b'] }, [Q('d_stage2_b')]).newly, [], '저장 기록을 보기 전에는 불가');
});

test('해금 판정: 점수 조합 예시 표(4.4)와 같은 결과 (일반·중요는 합계만, 핵심은 S1·S2 만점 + 합계 4)', () => {
  // 일반 c_usb_reason, 중요 b_witness, 핵심 d_motive_a(앞 단계까지 풀린 상태). 필요 근거는 갖춘 것으로 둔다
  const st = (roleId, extra = []) => ({ ...initialState('A')[roleId], unlocked: [...initialState('A')[roleId].unlocked, ...extra], evidence: ['clue:usblog', 'clue:usb', 'clue:mentoring', 'clue:message'] });
  const run = (roleId, target, [s1, s2, s3, s4], extra) =>
    applyJudgement(roleId, st(roleId, extra), [Q(target, { s1, s2, s3, s4 })]).scored[0].outcome;
  const core = ['d_stage1_a', 'd_stage2_a', 'd_stage3_a'];
  const table = [
    [[2, 2, 0, 0], 'unlock', 'unlock', 'unlock'],
    [[2, 1, 1, 0], 'unlock', 'unlock', 'near'],
    [[2, 0, 0, 0], 'near', 'near', 'near'],
    [[2, 2, 0, -1], 'unlock', 'near', 'near'],
    [[1, 1, 1, 0], 'unlock', 'near', 'near']
  ];
  for (const [scores, normal, important, coreOut] of table) {
    assert.equal(run('C', 'c_usb_reason', scores), normal, '일반 ' + scores);
    assert.equal(run('B', 'b_witness', scores), important, '중요 ' + scores);
    assert.equal(run('D', 'd_motive_a', scores, core), coreOut, '핵심 ' + scores);
  }
});

test('해금 판정: 절대 기준(G1 앞 단계, G2 첨부 연결, G3 구체성)이 하나라도 실패하면 해금 불가, 형식 확인', () => {
  const C = { ...initialState('A').C, evidence: [] };
  const withBoth = { evidence: ['clue:usblog', 'clue:usb'], attached: true };
  assert.deepEqual(applyJudgement('C', C, [Q('c_usb_reason', { g2: 'yes' })], withBoth).newly, ['c_usb_reason']);
  // G2: 첨부가 있는데 질문이 첨부와 따로 놀면 불가 ("na"로 적어도 첨부가 있으면 실패)
  assert.deepEqual(applyJudgement('C', C, [Q('c_usb_reason', { g2: 'no' })], withBoth).newly, []);
  assert.deepEqual(applyJudgement('C', C, [Q('c_usb_reason', { g2: 'na' })], withBoth).newly, []);
  // G3: 포괄적인 질문
  assert.deepEqual(applyJudgement('C', C, [Q('c_usb_reason', { g3: false, g2: 'yes' })], withBoth).newly, []);
  // 형식 확인: 처음부터 아는 사실·이미 풀린 사실·다른 갈래 사실·없는 사실은 고를 수 없다
  const opened = { ...C, unlocked: [...C.unlocked, 'c_usb_reason'], evidence: ['clue:usblog', 'clue:usb'] };
  for (const target of ['c_usb_reason', 'c_usb_morning', 'c_witness_b', 'zzz']) {
    const r = applyJudgement('C', opened, [Q(target)]).scored[0];
    assert.equal(r.target, null, target);
    assert.equal(r.outcome, 'none');
  }
  // S1=0 은 "무관"이라 겨냥 사실이 없는 것으로 본다 (다른 점수로 해금선을 넘지 못함)
  const unrelated = applyJudgement('C', { ...C, evidence: ['clue:usblog', 'clue:usb'] }, [Q('c_usb_reason', { s1: 0, s3: 1 })]).scored[0];
  assert.equal(unrelated.target, null);
  assert.equal(unrelated.outcome, 'none');
});

test('G4 필수 근거: 필요 근거를 이 NPC에게 내밀지 않았으면 점수와 관계없이 해금 불가, 필요 근거 없는 사실은 해당 없음', () => {
  const C = initialState('A').C;
  // 만점 질문이라도 USB 접속 기록·빈 USB(필요 근거)를 보여 준 적 없으면 G4 실패 → 해금도 근접도 아님
  const guess = applyJudgement('C', C, [Q('c_usb_reason', { s3: 1 }), Q('c_witness_a', { s3: 1 })]);
  assert.deepEqual(guess.scored.map(x => x.g4), [false, false]);
  assert.deepEqual(guess.newly, []);
  assert.deepEqual(guess.scored.map(x => x.outcome), ['none', 'none']);
  assert.equal(guess.near, false, '증거 없이 찍은 질문에는 당황 표정도 주지 않는다');
  // 힌트: G4 실패는 G1(순서)이 아니라 G4(증거)로 센다
  const flags = lowFlags(guess.scored);
  assert.equal(flags.G4, true);
  assert.equal(flags.G1, false);
  // 이번 첨부로 보여 주면 통과 (all 조합: 두 근거 모두)
  const shown = applyJudgement('C', C, [Q('c_usb_reason', { g2: 'yes' })], { evidence: ['clue:usblog', 'clue:usb'], attached: true });
  assert.equal(shown.scored[0].g4, true);
  assert.deepEqual(shown.newly, ['c_usb_reason']);
  // 지난번에 이 NPC에게 보여 준 첨부도 인정 (이번엔 말로만 물어도 됨)
  assert.deepEqual(applyJudgement('C', { ...C, evidence: ['clue:usblog', 'clue:usb'] }, [Q('c_usb_reason')]).newly, ['c_usb_reason']);
  // 다른 NPC에게 보여 준 것은 인정하지 않는다 (증거는 NPC별 기록)
  const D = initialState('A').D;
  assert.equal(applyJudgement('D', D, [Q('d_stage1_a', { s3: 1 })]).scored[0].g4, false);
  // any 조합: c_witness_a 는 USB 접속 기록 또는 빈 USB 하나면 된다
  assert.equal(applyJudgement('C', { ...C, evidence: ['clue:usb'] }, [Q('c_witness_a')]).scored[0].g4, true);
  // 필요 근거가 없는 사실은 G4 해당 없음
  const B = initialState('A').B;
  assert.equal(applyJudgement('B', B, [Q('b_witness')]).scored[0].g4, null);
  assert.deepEqual(applyJudgement('B', B, [Q('b_witness')]).newly, ['b_witness']);
});

test('근거성 형식 확인: 필요 근거가 없으면 S2 최대 1, 첨부·기록이 없거나 인용이 "없음"이면 0', () => {
  const C = initialState('A').C;
  // 필요 근거를 보여 준 적 없음 → S2 2 → 1 (해금은 G4가 막는다)
  const noEvidence = applyJudgement('C', C, [Q('c_usb_reason'), Q('c_witness_a')]);
  assert.deepEqual(noEvidence.scored.map(x => x.s2), [1, 1]);
  assert.deepEqual(noEvidence.newly, []);
  // 핵심 사실은 필요 근거 없이는 만점이 될 수 없다
  const D0 = initialState('A').D;
  const D = { ...D0, unlocked: [...D0.unlocked, 'd_stage1_a', 'd_stage2_a', 'd_stage3_a'], evidence: [] };
  assert.deepEqual(applyJudgement('D', D, [Q('d_motive_a', { s3: 1 })]).newly, []);
  assert.deepEqual(applyJudgement('D', D, [Q('d_motive_a', { g2: 'yes' })], { evidence: ['clue:mentoring', 'clue:message'], attached: true }).newly, ['d_motive_a']);
  // 첨부도 기록도 없음, 또는 근거 인용 "없음"
  const B = initialState('A').B;
  assert.equal(applyJudgement('B', B, [Q('b_witness')], { grounded: false }).scored[0].s2, 0);
  assert.equal(applyJudgement('B', B, [Q('b_witness', { basis: '없음' })]).scored[0].s2, 0);
  assert.equal(applyJudgement('B', B, [Q('b_witness')]).scored[0].s2, 2, '필요 근거가 없는 사실은 깎지 않는다');
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
    a_correction: 'important', a_message: 'important', b_witness: 'important',
    c_witness_a: 'important', c_witness_b: 'important', c_usb_reason: 'normal',
    d_savelog_b: 'normal', d_stage1_a: 'important', d_stage1_b: 'important', d_stage2_a: 'important', d_stage2_b: 'important',
    d_stage3_a: 'core', d_stage3_b: 'core', d_motive_a: 'core', d_motive_b: 'core'
  });
  // 갈래 태그가 붙은 사실은 A/B 만, 갈래마다 같은 모순 ID 가 한 번씩
  for (const r of roleIds) for (const f of roles[r].facts) if (f.branch) assert.ok(ALIBIS.includes(f.branch), f.id);
});

test('질문 처리: 판정을 먼저 기다리고 메인 모델은 한 번만, 반려·되묻기면 메인 모델을 부르지 않는다', async () => {
  const game = { cast: allCasts[0], victim: '곽도현', state: initialState() };
  const run = async (judged, remaining = 20, attach = null) => {
    const order = [];
    const model = async (task, req) => {
      order.push(task);
      if (task === 'judge') {
        assert.ok(req.system[1].includes('[대상의 사실 목록') && req.user.includes('[사실 상태'), '판정 입력: 사실 목록(고정) + 사실 상태(가변)');
        assert.ok(!(req.system.join('') + req.user).includes('범인은'), '판정 입력에 정답(진상 문서) 없음');
        return { value: judged, metric: {} };
      }
      return { value: task === 'draft' ? { reply: '대답', emotion: '기본' } : { pass: true, reason: '', disclosed: [] }, metric: {} };
    };
    const r = await runQuestion({ model, game, roleId: 'B', question: 'q', attach, history: [], remaining });
    return { r, order };
  };
  const one = await run(JUDGED('case', { target: 'b_witness', g2: 'yes', g3: true, s1: 2, basis: '자습실 이용 기록', s2: 2 }), 20, { type: 'clue', id: 'usblog', title: 'USB 접속 기록' });
  assert.equal(one.r.debug.calls.length, 3);
  assert.deepEqual(one.order, ['judge', 'draft', 'verify']);
  assert.ok(one.r.state.unlocked.includes('b_witness'));
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
    value: task === 'judge' ? JUDGED('case', { target: 'b_witness', g3: true, s1: 1, s2: 1 })
      : task === 'draft' ? { reply: '자습실에만 있었어요.', emotion: '기본' } : { pass: true, reason: '', disclosed: [] },
    metric: {}
  });
  // 필요 근거가 없는 중요 사실에 S1 1 (해금선 4 미만)
  const r = await runQuestion({ model, game, roleId: 'B', question: '외출했을 때 뭐 봤어요?', attach: null, history: [] });
  assert.equal(r.emotion, '당황');
  assert.ok(!r.state.unlocked.includes('b_witness'));
});

test('프롬프트 누설: 범인이 숨긴 행동·동기는 다른 NPC 답변 프롬프트에 없고, 공통 규칙에는 사건 고유 내용이 없다', async () => {
  const { draftSystem, draftUser, DRAFT_RULES, JUDGE_RULES, VERIFY_RULES } = await import('../lib/ai/prompts.mjs');
  const { motive } = await import('../lib/game/data/case.mjs');
  // 공통 규칙은 네 NPC 모두에게 간다. 사건 고유 낱말(단서·범행 수단)을 쓰지 않고 목록 이름만 가리킨다
  for (const word of ['수신기', '휴지통', '대화방', '빌드', '룰렛', '키보드', '보복', '앙갚']) {
    assert.ok(!(DRAFT_RULES + JUDGE_RULES + VERIFY_RULES).includes(word), '공통 규칙에 사건 고유 낱말: ' + word);
  }
  for (const cast of allCasts.slice(0, 4)) {
    const game = { cast, victim: '곽도현', state: initialState() };
    const vars = templateVars(game);
    // 범인이 숨긴 것: D의 잠긴 사실 내용·숨김 설명, 범행 동기 (공개 단서 카드는 누구나 볼 수 있어 제외)
    const secrets = [
      ...roles.D.facts.filter(f => !f.start).flatMap(f => [f.say, f.hint].filter(Boolean)),
      motive
    ].map(s => fill(s, vars).replace(/\s*\([^()]*\)/g, '').slice(0, 20));
    for (const r of ['A', 'B', 'C']) {
      const text = draftSystem(game, r) + draftUser({ game, view: factView(r, game.state[r]), history: [], attachment: null, kind: 'case', question: 'q' });
      for (const s of secrets) assert.ok(!text.includes(s), `${r} 답변 프롬프트에 범인 비밀: ${s}`);
    }
  }
});

test('구조화 출력: NPC 단위로 고정된 공통 스키마, 목록 밖 ID·범위 밖 점수·근거 인용 누락은 거부', async () => {
  const { checkSchema } = await import('../lib/ai/llm.mjs');
  const { fastSchema } = await import('../lib/ai/prompts.mjs');
  const schema = fastSchema('B');
  assert.equal(fastSchema('B'), schema, '같은 NPC면 같은 스키마 (질문마다 바뀌지 않음)');
  const wrap = q => ({ result: { task: 'judge', count_reason: '1', unclear: false, questions: [q] } });
  const ok = JUDGED('case', { target: 'b_witness', s1: 2 }).questions[0];
  assert.ok(checkSchema(wrap(ok), schema));
  assert.ok(checkSchema(wrap({ ...ok, target: 'b_study' }), schema), '전체 ID 고정 (고를 수 있는지는 코드가 확인)');
  assert.ok(!checkSchema(wrap({ ...ok, target: 'd_stage1_a' }), schema), '다른 NPC의 사실 ID');
  assert.ok(!checkSchema(wrap({ ...ok, s1: 3 }), schema));
  assert.ok(!checkSchema(wrap({ ...ok, s4: 1 }), schema));
  assert.ok(!checkSchema(wrap({ ...ok, s2: '2' }), schema));
  const { basis, ...noBasis } = ok;
  assert.ok(basis !== undefined && !checkSchema(wrap(noBasis), schema), '근거 인용(basis) 필수');
  assert.ok(checkSchema({ result: { task: 'verify', reason: '통과', pass: true, disclosed: ['b_submit'] } }, schema), '검증 갈래');
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
  // 1) 판정·검증·두 번째 판정 모두 system 전체가 같고 스키마 객체도 같다 (할 작업은 user 맨 끝에서 고른다)
  assert.ok(fast.every(r => r.system.join('\n') === fast[0].system.join('\n')), '판정·검증 system 전체 동일');
  assert.ok(fast.every(r => r.schema === fast[0].schema), '스키마 동일');
  assert.equal(new Set(requests.map(r => r.cacheKey)).size, 1, '같은 게임은 같은 캐시 키');
  // 1-0) 캐시 키는 게임 단위: 같은 게임의 다른 NPC 도 같은 키(전역 규칙 캐시를 같은 서버에서 같이 쓰도록), 다른 게임은 다른 키
  const { cacheKeyOf } = await import('../lib/ai/pipeline.mjs');
  const before = requests.length;
  await runQuestion({ model, game, roleId: 'C', question: '이 기록 보세요', attach: { type: 'clue', id: 'source', title: '소스 열람 기록' }, history: [] });
  assert.equal(new Set(requests.map(r => r.cacheKey)).size, 1, '같은 게임의 다른 NPC 도 같은 캐시 키');
  assert.ok(requests.length > before);
  assert.notEqual(cacheKeyOf(game), cacheKeyOf({ ...game, id: 'g-2' }), '다른 게임은 다른 키');
  assert.ok(!cacheKeyOf(game).includes(game.id), '게임 ID 원문은 보내지 않는다');
  // 1-1) 정적 → 동적: 맨 앞은 모든 게임·NPC 공통 규칙(T0), 그다음 게임·NPC 자료(T2)
  const P = await import('../lib/ai/prompts.mjs');
  assert.equal(fast[0].system[0], P.FAST_RULES, '빠른 모델 맨 앞은 전역 고정 규칙');
  assert.ok(fast.filter(r => r.task === 'judge').every(r => r.user.endsWith(P.JUDGE_TASK)), '판정 작업 선택은 user 맨 끝');
  assert.ok(fast.filter(r => r.task === 'verify').every(r => r.user.endsWith(P.VERIFY_TASK)), '검증 작업 선택은 user 맨 끝');
  // 2) 게임 자료에는 상태가 없다 (해금 후에도 같음), 사실은 전부 고정 순서로
  assert.ok(availableFacts('B', game.cast._alibi ?? 'A').every(f => fast[0].system[1].includes(`(${f.id})`)));
  assert.ok(!/해금 가능|이미 털어놓음|앞 단계 미충족/.test(fast[0].system[1]), '게임 자료(T2)에 진행 상태 없음');
  // 3) 가변 부분은 대화 기록이 맨 앞이고, 다음 질문의 기록은 앞 질문 기록 뒤에 붙기만 한다
  const drafts = requests.filter(r => r.task === 'draft');
  assert.equal(drafts[0].system, drafts[1].system, '초안 system 고정');
  assert.ok(fast[2].user.startsWith('[대화 기록'), '판정 가변 부분은 대화 기록부터');
  const line1 = fast[2].user.split('\n')[1];
  assert.match(line1, /이 기록 보세요/);
  // 4) 키·시각 같은 바뀌는 값이 앞부분에 없다
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(fast[0].system.join('')));
  // 5) 초안: system 은 전역 규칙(T0) → 캐릭터(T1) → 역할(T2), user 는 기록(T3) → 진행 상태(T4) → 이번 질문(T5)
  const ds = drafts[0].system;
  assert.ok(ds.startsWith(P.DRAFT_RULES), '초안 맨 앞은 전역 고정 규칙');
  assert.ok(ds.indexOf('[캐릭터:') < ds.indexOf('[역할]'), '캐릭터 → 역할');
  const du = drafts[1].user;
  const at = s => du.indexOf(s);
  assert.ok(at('[대화 기록') === 0 && at('[대화 기록') < at('[지금 말할 수 있는 것]'), '기록이 맨 앞');
  assert.ok(at('[숨기고 있는 것') < at('[이번 질문에 새로 인정할 것'), '해금 때만 바뀌는 상태가 질문마다 바뀌는 것보다 앞');
  assert.ok(at('[이번 질문에 새로 인정할 것') < at('[질문 (데이터)]'), '질문이 상태보다 뒤');
});

test('동기 채점: 규칙과 기준 동기는 system(정적), 답안만 user(동적)', async () => {
  const { gradeMotive } = await import('../lib/ai/pipeline.mjs');
  const P = await import('../lib/ai/prompts.mjs');
  const seen = [];
  const model = async (task, req) => { seen.push(req); return { value: { match: true }, metric: {} }; };
  await gradeMotive({ model, reference: '기준', answer: '답안 하나' });
  await gradeMotive({ model, reference: '기준', answer: '다른 답안' });
  assert.deepEqual(seen[0].system, seen[1].system);
  assert.equal(seen[0].system[0], P.MOTIVE_RULES);
  assert.ok(!seen[0].system.join('').includes('답안 하나'));
  assert.ok(seen[0].user.includes('답안 하나') && !seen[0].user.includes('기준'));
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

test('캐릭터 시트: 성격 + 말버릇 앙케이트만 남고, 앙케이트 필수 칸(평상시)이 있고, 프롬프트에 원문 그대로 실린다', () => {
  const allowed = ['id', 'name', 'summary', 'address', 'personality', 'speech'];
  for (const id of characterIds) {
    const c = characters[id];
    assert.deepEqual(Object.keys(c).sort(), [...allowed].sort(), id);
    assert.ok(c.personality.length > 0, id);
    for (const part of ['register', 'endings']) {
      for (const a of AUDIENCES) assert.ok(c.speech[part][a]?.['평상시'], `${id} ${part} ${a} 평상시`);
    }
    for (const a of AUDIENCES) {
      for (const v of Object.values(c.speech.register[a])) assert.ok(['반말', '존댓말', '섞음'].includes(v), `${id} ${a} ${v}`);
    }
    assert.ok(c.speech.examples['평상시'], id + ' 예문 평상시');
    for (const part of ['openers', 'fillers', 'length', 'examples']) {
      for (const k of Object.keys(c.speech[part])) assert.ok(!SITUATIONS.includes(k) || typeof c.speech[part][k] === 'string', `${id} ${part} ${k}`);
    }
    const block = characterBlock(id);
    for (const v of Object.values(c.speech.examples)) assert.ok(block.includes(v), id + ' 예문 원문');
    assert.ok(!/잡담용 정보|금지 주제|취조받을 때/.test(block), id + ' 예전 시트 항목 없음');
  }
});
