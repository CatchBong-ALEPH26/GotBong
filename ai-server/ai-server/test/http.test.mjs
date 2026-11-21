import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http.mjs';
import { fixture } from '../src/llm.mjs';

const CAST = { A: 'kim', B: 'hwangyc', C: 'won', D: 'hwanggh' };

async function start(t, options = {}) {
  const server = createApp({ fixed: { cast: CAST, victim: '곽도현' }, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); await closed; });
  const origin = 'http://127.0.0.1:' + server.address().port;
  let cookie;
  async function request(route, body) {
    const response = await fetch(origin + '/api/' + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return { code: response.status, data: await response.json() };
  }
  let n = 0;
  const ask = (npc, question, attach) => request('question', { npc, question, attach, requestId: 'req-' + String(n++).padStart(4, '0') });
  return { origin, request, ask };
}

test('세션: 사람 ID만 노출, 실명·피해자 치환, 사실 태그 비노출', async t => {
  const { origin, request, ask } = await start(t);
  assert.equal((await fetch(origin + '/')).status, 200);
  assert.equal((await fetch(origin + '/data/case.mjs')).status, 404);
  const { data } = await request('session');
  assert.deepEqual(data.npcs.map(n => n.id).sort(), ['hwanggh', 'hwangyc', 'kim', 'won']);
  assert.equal(data.clues.length, 5);
  assert.equal(data.victim, '곽도현');
  assert.match(data.intro, /곽도현이/);
  assert.match(data.clues.find(c => c.id === 'build').title, /황건희/);
  const r = await ask('hwanggh', '쉬는 시간에 어디 계셨어요?');
  assert.equal(r.data.status, 'accepted');
  const raw = JSON.stringify(r.data) + JSON.stringify((await request('session')).data);
  assert.ok(!/d_points_a|d_alibi|"role"|"facts"/.test(raw), '역할·사실 태그 유출');
});

test('질문 흐름: 반려·명확화는 차감 없음, 멱등성, 첨부로 해금', async t => {
  const { request, ask } = await start(t, { debug: true });
  await request('session');
  const bad = await ask('kim', '/검증실패');
  assert.equal(bad.data.status, 'rejected');
  assert.equal(bad.data.debug.retried, true);
  assert.equal(bad.data.remaining, 20);
  assert.equal((await ask('kim', '어디였어? 누구 봤어?')).data.status, 'clarify');

  const body = { npc: 'hwanggh', question: '쉬는 시간에 뭐 하셨어요?', requestId: 'fixed-0001' };
  const d0 = await request('question', body);
  assert.equal(d0.data.remaining, 19);
  assert.equal((await request('question', body)).data.turn.id, d0.data.turn.id);
  assert.equal((await request('question', { ...body, question: '다른 질문' })).code, 409);

  // D의 "A가 왔었다"를 A(김봉경)에게 첨부 → A 해금
  const a1 = await ask('kim', '이 말 사실이에요?', { type: 'turn', id: d0.data.turn.id });
  assert.deepEqual(a1.data.debug.unlocked, ['a_testimony']);
  assert.equal(a1.data.debug.cast.A, '김봉경');
  assert.equal(a1.data.turn.attach.npc, 'hwanggh');
  // 자기 발언 첨부 금지, 없는 단서 금지
  assert.equal((await ask('hwanggh', '?', { type: 'turn', id: d0.data.turn.id })).code, 400);
  assert.equal((await ask('won', '이거 봐요', { type: 'clue', id: 'nope' })).code, 400);
  // 단서 첨부
  const b = await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'source' });
  assert.deepEqual(b.data.debug.unlocked, ['b_source']);
  // 잡담은 검증 생략
  const chat = await ask('won', '요즘 뭐에 빠져 계세요');
  assert.equal(chat.data.debug.skippedVerify, true);
  assert.equal(chat.data.debug.calls.length, 2);
});

test('최종 제출: 사람 ID로 판정, 채점 실패는 0점이 아닌 오류', async t => {
  let fail = false;
  const model = async (task, req) => {
    if (fail && task === 'motive') throw Object.assign(new (await import('../src/llm.mjs')).LlmError('테스트 오류'));
    return fixture(task, req);
  };
  const { request } = await start(t, { model });
  await request('session');
  const answer = { npc: 'hwanggh', motive: '피해자가 시연 오류를 놀려서 복수하려고', requestId: 'submit-0001' };
  fail = true;
  assert.equal((await request('submit', answer)).code, 502);
  assert.equal((await request('session')).data.result, null);
  fail = false;
  const ok = await request('submit', answer);
  assert.equal(ok.data.result.score, 1);
  assert.equal(ok.data.result.cast.find(c => c.role === 'D').name, '황건희');
  assert.equal((await request('submit', { ...answer, requestId: 'submit-0002' })).code, 409);

  const reset = await request('reset', {});
  assert.equal(reset.data.remaining, 20);
  assert.equal(reset.data.result, null);
  const wrong = await request('submit', { npc: 'kim', motive: '놀림에 복수', requestId: 'submit-0003' });
  assert.equal(wrong.data.result.score, 0);
});
