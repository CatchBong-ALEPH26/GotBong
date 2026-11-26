import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyJudgement, clueAtSpot } from '../lib/game/game.mjs';
import { discoverClue, hasDiscoveredClue, recordContradictions, publicInvestigation } from '../lib/game/contradictions.mjs';

const Q = target => ({ target, kind: 'case', g2: 'yes', g3: true, s1: 2, basis: '검증된 근거', s2: 2, s3: 0, s4: 0 });
function open(state, role, target, evidence) {
  const r = applyJudgement(role, state[role], [Q(target)], { evidence, attached: true });
  return { r, state: { ...state, [role]: r.state } };
}

test('v2: 미발견 단서는 서버의 공식 발견 목록에 들어가지 않는다', () => {
  const s = initialState();
  assert.equal(hasDiscoveredClue(s, 'receiver'), false);
  const found = discoverClue(s, 'receiver');
  assert.equal(hasDiscoveredClue(found, 'receiver'), true);
  assert.deepEqual(discoverClue(found, 'receiver'), found);
  assert.deepEqual(publicInvestigation(s).solved, []);
});

test('v2: 정적 단서 위치 검증과 범인에 따라 바뀌는 모니터', () => {
  const game = { cast: { D: 'kim' } };
  assert.equal(clueAtSpot(game, 'front-usb'), 'c_front_usb');
  assert.equal(clueAtSpot(game, 'desk-recent'), 'source');
  assert.equal(clueAtSpot(game, 'monitor-kim'), 'build');
  assert.equal(clueAtSpot(game, 'monitor-won'), null);
  assert.equal(clueAtSpot(game, 'front-usb-hacked'), null);
});

test('v2: A의 목격 없이는 D의 첫 거짓말을 해금할 수 없다', () => {
  let s = initialState();
  const failed = open(s, 'D', 'd_cable_excuse', []).r;
  assert.deepEqual(failed.newly, []);
  assert.equal(failed.scored[0].g1, false);
  const ok = open(s, 'D', 'd_cable_excuse', ['cite:a_testimony']);
  assert.deepEqual(ok.r.newly, ['d_cable_excuse']);
  assert.deepEqual(recordContradictions(ok.state, []).newlySolved, []);
  assert.deepEqual(recordContradictions(ok.state, ['d_cable_excuse']).newlySolved.map(x => x.id), ['core_01']);
});

test('v2: 두 번째 모순은 두 근거와 앞 단계의 완료 기록이 필요', () => {
  let s = initialState();
  s = open(s, 'D', 'd_cable_excuse', ['cite:a_testimony']).state;
  const missing = open(s, 'D', 'd_receiver', ['clue:receiver']);
  assert.deepEqual(missing.r.newly, []);
  s = open(s, 'D', 'd_receiver', ['cite:c_cable', 'clue:receiver']).state;
  assert.deepEqual(recordContradictions(s, ['d_receiver']).newlySolved, []);
  s = recordContradictions(s, ['d_cable_excuse']).state;
  const solved = recordContradictions(s, ['d_receiver']);
  assert.deepEqual(solved.newlySolved.map(x => x.id), ['core_02']);
  assert.deepEqual(recordContradictions(solved.state, ['d_receiver']).newlySolved, []);
});

test('v2: 삭제 자백은 B 목격 + 휴지통이 필요하고, 동기는 대화방이 필요', () => {
  let s = initialState();
  s = open(s, 'D', 'd_cable_excuse', ['cite:a_testimony']).state;
  s = recordContradictions(s, ['d_cable_excuse']).state;
  s = open(s, 'D', 'd_receiver', ['cite:c_cable', 'clue:receiver']).state;
  s = recordContradictions(s, ['d_receiver']).state;
  assert.deepEqual(open(s, 'D', 'd_delete', ['clue:build', 'clue:trash']).r.newly, []);
  s = open(s, 'D', 'd_delete', ['cite:b_typing', 'clue:trash']).state;
  s = recordContradictions(s, ['d_delete']).state;
  assert.deepEqual(open(s, 'D', 'd_motive', []).r.newly, []);
  s = open(s, 'D', 'd_motive', ['clue:chat']).state;
  s = recordContradictions(s, ['d_motive']).state;
  const p = publicInvestigation(s);
  assert.equal(p.core, 4);
  assert.equal(p.optional, 0);
  assert.equal(p.solved.length, 4);
});

test('v2: 선택 모순은 B와 C의 사실을 별도로 공개해야 완료', () => {
  let s = initialState();
  s = open(s, 'B', 'b_source', ['clue:source']).state;
  s = open(s, 'B', 'b_compare', ['clue:source']).state;
  s = recordContradictions(s, ['b_compare']).state;
  s = open(s, 'C', 'c_cable', ['cite:d_cable_excuse']).state;
  assert.deepEqual(open(s, 'C', 'c_usb_distinction', ['clue:c_front_usb']).r.newly, []);
  s = open(s, 'C', 'c_usb_distinction', ['clue:c_front_usb', 'clue:receiver']).state;
  s = recordContradictions(s, ['c_usb_distinction']).state;
  const p = publicInvestigation(s);
  assert.equal(p.core, 0);
  assert.equal(p.optional, 2);
});
