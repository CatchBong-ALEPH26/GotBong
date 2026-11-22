// Workers API(app/api/*/route.js)를 Node에서 직접 호출하는 계약 테스트.
// D1은 node:sqlite + migrations/*.sql로 흉내 내고, 'cloudflare:workers'의 env는 테스트가 주입한다.
// 실제 Cloudflare·AI 호출은 하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const env = {};
globalThis.__gotbongTestEnv = env;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return { url: 'data:text/javascript,export const env = globalThis.__gotbongTestEnv;', shortCircuit: true };
    }
    return next(specifier, context);
  }
});

const routes = {
  session: (await import('../app/api/session/route.js')).GET,
  question: (await import('../app/api/question/route.js')).POST,
  submit: (await import('../app/api/submit/route.js')).POST,
  reset: (await import('../app/api/reset/route.js')).POST
};

// D1 바인딩에서 db-d1.mjs가 쓰는 부분만 구현: prepare().bind().first/all/run, batch(트랜잭션)
function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  const statement = (query, args = []) => ({
    bind: (...values) => statement(query, values),
    first: async () => sql.prepare(query).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    run: async () => (sql.prepare(query).run(...args), { success: true }),
    exec: () => sql.prepare(query).run(...args)
  });
  return {
    sql,
    prepare: query => statement(query),
    async batch(list) {
      sql.exec('BEGIN');
      try {
        for (const s of list) s.exec();
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

const CAST = { A: 'kim', B: 'hwangyc', C: 'won', D: 'hwanggh' };

function start(t) {
  const db = fakeD1();
  for (const key of Object.keys(env)) delete env[key];
  env.DB = db;
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  let cookie;
  async function request(route, body) {
    const response = await routes[route](new Request('https://gotbong.test/api/' + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    }));
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return { code: response.status, data: await response.json(), headers: response.headers };
  }
  // 무작위 배정을 테스트용 고정 배정으로 바꾼다
  function fixCast() {
    db.sql.prepare('UPDATE games SET cast = ?, victim = ? WHERE id = ?')
      .run(JSON.stringify(CAST), '곽도현', cookie.split('=')[1]);
  }
  const unlocked = role => JSON.parse(db.sql.prepare('SELECT state FROM games WHERE id = ?').get(cookie.split('=')[1]).state)[role].unlocked;
  let n = 0;
  const ask = (npc, question, attach) => request('question', { npc, question, attach, requestId: 'req-' + String(n++).padStart(4, '0') });
  return { db, request, ask, fixCast, unlocked };
}

test('세션: 쿠키 발급, 사람 ID만 노출, 실명·피해자 치환, 사실 태그 비노출', async t => {
  const { request, ask, fixCast } = start(t);
  const first = await request('session');
  assert.equal(first.code, 200);
  assert.match(first.headers.get('set-cookie'), /^game=[a-f0-9-]{36}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000; Secure$/);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  fixCast();

  const { data, headers } = await request('session');
  assert.equal(headers.get('set-cookie'), null, '기존 게임이면 쿠키를 다시 발급하지 않는다');
  assert.deepEqual(data.npcs.map(p => p.id).sort(), ['hwanggh', 'hwangyc', 'kim', 'won']);
  assert.equal(data.clues.length, 5);
  assert.equal(data.victim, '곽도현');
  assert.match(data.intro, /곽도현이/);
  assert.match(data.clues.find(c => c.id === 'build').title, /황건희/);
  assert.equal(data.mode, 'fixture');
  assert.equal(data.remaining, 20);

  const r = await ask('hwanggh', '쉬는 시간에 어디 계셨어요?');
  assert.equal(r.data.status, 'accepted');
  const raw = JSON.stringify(r.data) + JSON.stringify((await request('session')).data);
  assert.ok(!/d_points_a|d_alibi|"role"|"facts"/.test(raw), '역할·사실 태그 유출');
});

test('질문: 반려·명확화는 차감 없음, 멱등성, 첨부로 해금, 입력 검증', async t => {
  const { request, ask, fixCast, unlocked } = start(t);
  assert.equal((await ask('kim', '안녕하세요')).code, 409, '세션 없이 질문 불가');
  await request('session');
  fixCast();

  const bad = await ask('kim', '/검증실패');
  assert.equal(bad.data.status, 'rejected');
  assert.equal(bad.data.remaining, 20);
  assert.equal((await ask('kim', '어디였어? 누구 봤어?')).data.status, 'clarify');

  const body = { npc: 'hwanggh', question: '쉬는 시간에 뭐 하셨어요?', requestId: 'fixed-0001' };
  const d0 = await request('question', body);
  assert.equal(d0.data.remaining, 19);
  const again = await request('question', body);
  assert.equal(again.data.turn.id, d0.data.turn.id, '같은 요청 ID는 같은 결과');
  assert.equal(again.data.remaining, 19, '재시도는 차감하지 않는다');
  assert.equal((await request('question', { ...body, question: '다른 질문' })).code, 409);

  // D의 "A가 왔었다"를 A(김봉경)에게 첨부 → A 해금
  const a1 = await ask('kim', '이 말 사실이에요?', { type: 'turn', id: d0.data.turn.id });
  assert.equal(a1.data.status, 'accepted');
  assert.ok(unlocked('A').includes('a_testimony'));
  assert.equal(a1.data.turn.attach.npc, 'hwanggh');
  assert.equal(a1.data.turn.attach.facts, undefined, '첨부 발언의 사실 태그 비노출');
  // 자기 발언 첨부 금지, 없는 단서 금지
  assert.equal((await ask('hwanggh', '?', { type: 'turn', id: d0.data.turn.id })).code, 400);
  assert.equal((await ask('won', '이거 봐요', { type: 'clue', id: 'nope' })).code, 400);
  // 단서 첨부
  await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'source' });
  assert.ok(unlocked('B').includes('b_source'));

  // 입력 검증
  assert.equal((await ask('nobody', '누구세요')).code, 400);
  assert.equal((await ask('kim', 'x'.repeat(501))).code, 400);
  assert.equal((await request('question', { npc: 'kim', question: '짧은 ID', requestId: 'short' })).code, 400);
});

test('최종 제출: 사람 ID로 판정, 채점 실패는 0점이 아닌 502, 새 게임은 기록 보존', async t => {
  const { db, request, fixCast } = start(t);
  await request('session');
  fixCast();
  const answer = { npc: 'hwanggh', motive: '피해자가 시연 오류를 놀려서 복수하려고', requestId: 'submit-0001' };

  // 채점 모델 연결 실패를 흉내 낸다 (실제 네트워크 호출 없음)
  env.OPENAI_API_KEY = 'test-only';
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  assert.equal((await request('submit', answer)).code, 502);
  assert.equal((await request('session')).data.result, null);
  delete env.OPENAI_API_KEY;

  const ok = await request('submit', answer);
  assert.equal(ok.data.result.score, 1);
  assert.equal(ok.data.result.cast.find(c => c.role === 'D').name, '황건희');
  assert.equal((await request('submit', answer)).data.result.score, 1, '같은 요청 ID 재시도는 같은 결과');
  assert.equal((await request('submit', { ...answer, requestId: 'submit-0002' })).code, 409);

  const reset = await request('reset', {});
  assert.equal(reset.code, 200);
  assert.match(reset.headers.get('set-cookie'), /^game=/);
  assert.equal(reset.data.remaining, 20);
  assert.equal(reset.data.result, null);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM games').get().n, 2, '이전 게임은 지우지 않는다');
  fixCast();
  const wrong = await request('submit', { npc: 'kim', motive: '놀림에 복수', requestId: 'submit-0003' });
  assert.equal(wrong.data.result.score, 0);
});

test('commit: revision이 어긋나면 요청 기록·상태가 모두 저장되지 않는다', async t => {
  const { db, request } = start(t);
  await request('session');
  const { openD1 } = await import('../lib/server/db-d1.mjs');
  const store = openD1(db);
  const id = db.sql.prepare('SELECT id FROM games').get().id;
  await assert.rejects(store.commit({
    gameId: id, expectedRevision: 5, requestId: 'stale-0001', fingerprint: 'x',
    response: {}, state: {}, remaining: 3
  }));
  assert.equal(await store.getRequest(id, 'stale-0001'), null);
  assert.equal((await store.getGame(id)).remaining, 20);
});
