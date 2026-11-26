// Workers API(app/api/*/route.js)를 Node에서 직접 호출하는 계약 테스트.
// D1은 node:sqlite + migrations/*.sql로 흉내 내고, 'cloudflare:workers'의 env는 테스트가 주입한다.
// 실제 Cloudflare·AI 호출은 하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 자동 테스트는 실제 AI를 한 번도 부르지 않는다 (Fixture·가짜 모델만). 실제 AI 주소로 나가려 하면 바로 실패시킨다.
const guardedFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  if (/api\.openai\.com|generativelanguage\.googleapis\.com/.test(String(url))) throw new Error('테스트에서 실제 AI 호출 금지: ' + url);
  return guardedFetch(url, ...rest);
};
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
  reset: (await import('../app/api/reset/route.js')).POST,
  investigate: (await import('../app/api/investigate/route.js')).POST
};

// D1 바인딩에서 db-d1.mjs가 쓰는 부분만 구현: prepare().bind().first/all/run, batch(트랜잭션)
// skip: 적용하지 않을 마이그레이션 파일 이름 (운영 D1에 아직 없는 상태를 흉내 낸다)
function fakeD1({ skip = [] } = {}) {
  const sql = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql') && !skip.includes(f)).sort()) {
    sql.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  const statement = (query, args = []) => ({
    bind: (...values) => statement(query, values),
    first: async () => sql.prepare(query).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    // 실제 D1처럼 바뀐 행 수를 meta.changes로 돌려준다
    run: async () => ({ success: true, meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
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
const cookieOf = r => r.headers.get('set-cookie') ?? '';

function start(t, d1 = {}) {
  const db = fakeD1(d1);
  for (const key of Object.keys(env)) delete env[key];
  env.DB = db;
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  // 쿠키 저장소: game(방), player(플레이어 번호). 지우면 다른 브라우저·다른 사람처럼 동작한다
  const jar = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
  async function request(route, body) {
    const response = await routes[route](new Request('https://gotbong.test/api/' + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(Object.keys(jar).length ? { Cookie: cookieHeader() } : {}) },
      body: body ? JSON.stringify(body) : undefined
    }));
    for (const c of response.headers.getSetCookie()) {
      const [k, v] = c.split(';')[0].split('=');
      jar[k] = v;
    }
    return { code: response.status, data: await response.json(), headers: response.headers };
  }
  // 무작위 배정을 테스트용 고정 배정으로 바꾼다
  function fixCast() {
    db.sql.prepare('UPDATE games SET cast = ?, victim = ? WHERE id = ?')
      .run(JSON.stringify(CAST), '곽도현', jar.game);
  }
  const unlocked = role => JSON.parse(db.sql.prepare('SELECT state FROM games WHERE id = ?').get(jar.game).state)[role].unlocked;
  let n = 0;
  const ask = (npc, question, attach) => request('question', { npc, question, attach, requestId: 'req-' + String(n++).padStart(4, '0') });
  return { db, request, ask, fixCast, unlocked, jar };
}

test('세션: 쿠키 발급, 사람 ID만 노출, 실명·피해자 치환, 사실 태그 비노출', async t => {
  const { request, ask, fixCast } = start(t);
  const first = await request('session');
  assert.equal(first.code, 200);
  const [gameSet, playerSet] = first.headers.getSetCookie();
  assert.match(gameSet, /^game=[a-f0-9-]{36}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000; Secure$/);
  assert.match(playerSet, /^player=[a-f0-9-]{36}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=31536000; Secure$/);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  fixCast();

  const { data, headers } = await request('session');
  assert.equal(headers.get('set-cookie'), null, '기존 게임이면 쿠키를 다시 발급하지 않는다');
  assert.deepEqual(data.npcs.map(p => p.id).sort(), ['hwanggh', 'hwangyc', 'kim', 'won']);
  assert.equal(data.clues.length, 5);
  assert.equal(data.victim, '곽도현');
  assert.match(data.intro, /곽도현이/);
  // 단서 카드는 찾기 전에 브라우저로 가므로 범인(D=황건희) 이름이 없어야 한다
  const build = data.clues.find(c => c.id === 'build');
  assert.ok(!/황건희/.test(build.title + build.detail), '빌드 기록 카드에 범인 이름 유출');
  assert.match(data.gameKey, /^[a-f0-9]{20}$/);
  assert.ok(!cookieOf(first).includes(data.gameKey), '게임 키는 쿠키의 게임 ID가 아니다');
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
  assert.equal((await ask('kim', '/모호 무슨 말이지')).data.status, 'clarify');
  assert.equal((await ask('kim', '???')).data.status, 'clarify');

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
  // 단서 첨부: 현장에서 찾기 전에는 내밀 수 없다 (차감 없음)
  const { thoughts } = await import('../lib/game/data/thoughts.mjs');
  const early = await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'source' });
  assert.equal(early.code, 400);
  assert.ok(thoughts.clueNotFound.includes(early.data.error), early.data.error);
  assert.ok(!unlocked('B').includes('b_source'));
  assert.equal((await request('investigate', { spot: 'desk-recent' })).data.clue.id, 'source');
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

  // 밝혀낸 모순은 제출 전에는 어디에도 보내지 않는다 (범인 쪽 정보)
  const before = await request('session');
  assert.ok(!JSON.stringify(before.data).includes('core_0'), '제출 전 세션에 모순 진행도 없음');

  // 첫 모순(자리 이탈 핑계)을 푼 상태에서 제출
  const id = db.sql.prepare('SELECT id, state FROM games').get();
  const state = JSON.parse(id.state);
  state.D.unlocked.push('d_cable_excuse');
  db.sql.prepare('UPDATE games SET state = ? WHERE id = ?').run(JSON.stringify(state), id.id);

  const ok = await request('submit', answer);
  assert.equal(ok.data.result.score, 1);
  assert.equal(ok.data.result.cast.find(c => c.role === 'D').name, '황건희');
  assert.deepEqual(ok.data.result.progress, { solved: [{ id: 'core_01', title: '사라진 30초' }], total: 4 });
  assert.deepEqual((await request('session')).data.result.progress, ok.data.result.progress, '새로고침해도 결과에 남는다');
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

test('동시 질문: 늦게 저장하는 쪽은 500이 아니라 409, 같은 요청 ID는 저장된 응답을 재생', async t => {
  const { db, request, fixCast } = start(t);
  await request('session');
  fixCast();
  const results = await Promise.all([
    request('question', { npc: 'kim', question: '쉬는 시간에 어디 계셨어요?', requestId: 'race-0001' }),
    request('question', { npc: 'won', question: '쉬는 시간에 어디 계셨어요?', requestId: 'race-0002' })
  ]);
  const codes = results.map(r => r.code);
  assert.ok(codes.every(c => c === 200 || c === 409), '동시 요청은 200 또는 409: ' + codes);
  assert.ok(codes.includes(200));

  const { openD1 } = await import('../lib/server/db-d1.mjs');
  const { commitOrReplay, GameHttpError } = await import('../lib/server/game-http.mjs');
  const store = openD1(db);
  const game = await store.getGame(db.sql.prepare('SELECT id FROM games').get().id);
  const failing = () => Promise.reject(new Error('constraint'));

  // 다른 요청이 먼저 반영됨 → 409
  await assert.rejects(
    commitOrReplay(store, { ...game, revision: game.revision - 1 }, { requestId: 'race-9999', fingerprint: 'x' }, failing),
    e => e instanceof GameHttpError && e.status === 409
  );
  // 같은 요청이 먼저 저장됨 → 저장된 응답 재생 (남은 질문은 최신 값)
  const saved = await store.getRequest(game.id, codes[0] === 200 ? 'race-0001' : 'race-0002');
  const replay = await commitOrReplay(store, game, { requestId: codes[0] === 200 ? 'race-0001' : 'race-0002', fingerprint: saved.fingerprint }, failing);
  assert.equal(replay.status, 'accepted');
  assert.equal(replay.remaining, game.remaining);
});

test('보호: 새 게임은 JSON 요청만, 잘못된 첨부는 재생 전에 400', async t => {
  const { db, request, fixCast } = start(t);
  await request('session');
  fixCast();
  const form = await routes.reset(new Request('https://gotbong.test/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: ''
  }));
  assert.equal(form.status, 415, '다른 사이트의 폼 전송으로 게임을 바꿀 수 없다');
  assert.equal(form.headers.get('set-cookie'), null);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM games').get().n, 1);

  const body = { npc: 'kim', question: '쉬는 시간에 어디 계셨어요?', requestId: 'attach-0001' };
  assert.equal((await request('question', body)).code, 200);
  assert.equal((await request('question', { ...body, attach: 'x' })).code, 400);
});

test('조사: 빌드 기록은 범인 자리 모니터에서만, 서버가 판정한다', async t => {
  const { request, fixCast } = start(t);
  assert.equal((await request('investigate', { spot: 'monitor-hwanggh' })).code, 409, '세션 없이 조사 불가');
  await request('session');
  fixCast();
  const hit = await request('investigate', { spot: 'monitor-hwanggh' });
  assert.equal(hit.code, 200);
  assert.equal(hit.data.clue.id, 'build');
  for (const npc of ['kim', 'hwangyc', 'won']) {
    assert.equal((await request('investigate', { spot: 'monitor-' + npc })).data.clue, null);
  }
  assert.equal((await request('investigate', { spot: 'desk' })).data.clue, null);
  assert.equal((await request('investigate', { spot: 42 })).code, 400);
});

test('0006 적용 전 D1: 조사·단서 첨부가 멈추지 않고 예전처럼 동작 (배포와 마이그레이션 순서가 바뀌어도 안전)', async t => {
  const { db, request, ask, fixCast } = start(t, { skip: ['0006_clues_found.sql'] });
  assert.ok(!db.sql.prepare('PRAGMA table_info(games)').all().some(c => c.name === 'clues_found'), '열 없음');
  const s = await request('session');
  assert.equal(s.code, 200);
  assert.equal(s.data.found, undefined, '기록이 없으면 found 를 보내지 않는다 (화면은 브라우저 기록만 씀)');
  fixCast();
  // 단서 있는 곳을 눌러도 500 이 아니라 카드가 나온다 (기록만 건너뜀)
  const hit = await request('investigate', { spot: 'desk-recent' });
  assert.equal(hit.code, 200);
  assert.equal(hit.data.clue.id, 'source');
  // 찾은 기록을 확인할 수 없으니 예전처럼 첨부를 받는다
  const attached = await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'trash' });
  assert.equal(attached.code, 200);
  assert.equal((await request('reset', {})).data.found, undefined);
});

test('조사 기록: 찾은 단서를 서버에 한 번만 기록, revision 은 그대로(기다리던 질문과 충돌 없음), 세션에 found', async t => {
  const { db, request, ask, fixCast, jar } = start(t);
  await request('session');
  fixCast();
  const row = () => db.sql.prepare('SELECT revision, clues_found FROM games WHERE id = ?').get(jar.game);
  const before = row().revision;
  // 고정된 곳(공용 표)과 사람 모니터 모두 서버가 판정해 기록한다. 같은 단서를 두 곳·여러 번 눌러도 한 번만
  assert.equal((await request('investigate', { spot: 'desk-folder' })).data.clue.id, 'trash');
  assert.equal((await request('investigate', { spot: 'desk-trash' })).data.clue.id, 'trash');
  assert.equal((await request('investigate', { spot: 'monitor-hwanggh' })).data.clue.id, 'build');
  assert.equal((await request('investigate', { spot: 'monitor-kim' })).data.clue, null);
  assert.deepEqual(JSON.parse(row().clues_found), ['trash', 'build']);
  assert.equal(row().revision, before, '조사는 revision 을 올리지 않는다');
  assert.deepEqual((await request('session')).data.found, ['trash', 'build']);

  // 질문 저장은 state 를 덮어써도 찾은 단서 기록을 지우지 않는다 (다른 열)
  assert.equal((await ask('hwanggh', '이 기록 설명해 주세요', { type: 'clue', id: 'trash' })).code, 200);
  assert.deepEqual(JSON.parse(row().clues_found), ['trash', 'build']);

  // 새 게임은 빈 기록으로 시작, 이전 방 기록은 남는다
  const old = jar.game;
  const next = await request('reset', {});
  assert.deepEqual(next.data.found, []);
  assert.deepEqual(JSON.parse(db.sql.prepare('SELECT clues_found FROM games WHERE id = ?').get(old).clues_found), ['trash', 'build']);
});

test('방 수 제한: 사람당 진행 중 2개, 서비스 전체 MAX_ACTIVE_ROOMS, 휴면 방은 세지 않는다', async t => {
  const { thoughts } = await import('../lib/game/data/thoughts.mjs');
  const { db, request, jar } = start(t);
  env.MAX_ACTIVE_ROOMS = '3';
  // 분당 생성 제한은 더 이상 쓰지 않는다 (바인딩이 있어도 호출하지 않음)
  env.GAME_CREATE_LIMITER = { limit: async () => { throw new Error('호출되면 안 됨'); } };
  const status = id => db.sql.prepare('SELECT status FROM games WHERE id = ?').get(id).status;
  const active = () => db.sql.prepare("SELECT COUNT(*) AS n FROM games WHERE status = 'active'").get().n;

  assert.equal((await request('session')).code, 200);
  const first = jar.game;
  // 새 게임: 지금 방은 종료, 새 방은 진행 중 (연속으로 여러 번 눌러도 진행 중 방은 하나)
  for (let i = 0; i < 4; i++) assert.equal((await request('reset', {})).code, 200);
  assert.equal(status(first), 'ended');
  assert.equal(active(), 1);
  // 게임 쿠키를 잃어도 같은 플레이어 번호로 2개까지
  delete jar.game;
  assert.equal((await request('session')).code, 200);
  delete jar.game;
  const third = await request('session');
  assert.equal(third.code, 429);
  assert.equal(third.data.code, 'player_rooms_full');
  assert.ok(thoughts.playerRoomsFull.includes(third.data.error), third.data.error);
  assert.equal(third.headers.get('set-cookie'), null, '방을 만들지 못하면 쿠키를 바꾸지 않는다');

  // 다른 사람: 전체 3개까지
  for (const k of Object.keys(jar)) delete jar[k];
  assert.equal((await request('session')).code, 200);
  const crowd = jar.game;
  for (const k of Object.keys(jar)) delete jar[k];
  const full = await request('session');
  assert.equal(full.code, 429);
  assert.equal(full.data.code, 'rooms_full');
  assert.deepEqual(full.headers.getSetCookie().map(c => c.split('=')[0]), ['player'], '방을 못 만들어도 플레이어 번호는 발급, 게임 쿠키는 없음');
  assert.ok(thoughts.roomsFull.includes(full.data.error), full.data.error);

  // 15분 넘게 쉰 방은 세지 않는다 → 다시 만들 수 있다
  db.sql.prepare('UPDATE games SET last_active_at = ? WHERE id = ?').run(Date.now() - 16 * 60 * 1000, crowd);
  for (const k of Object.keys(jar)) delete jar[k];
  assert.equal((await request('session')).code, 200);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM games').get().n, 8, '방 기록은 지우지 않는다');
});

test('같은 접속 IP당 진행 중 방 7개: 다른 IP·IP 없는 요청은 따로, IP 원문은 저장하지 않음', async t => {
  const { thoughts } = await import('../lib/game/data/thoughts.mjs');
  const { db } = start(t);
  // 매번 새 사람(쿠키 없음)으로, 지정한 IP에서 첫 접속
  const visit = async ip => {
    const response = await routes.session(new Request('https://gotbong.test/api/session', { headers: ip ? { 'cf-connecting-ip': ip } : {} }));
    return { code: response.status, data: await response.json(), cookies: response.headers.getSetCookie() };
  };
  for (let i = 0; i < 7; i++) assert.equal((await visit('203.0.113.7')).code, 200, `같은 IP ${i + 1}번째`);
  const eighth = await visit('203.0.113.7');
  assert.equal(eighth.code, 429);
  assert.equal(eighth.data.code, 'ip_rooms_full');
  assert.ok(thoughts.ipRoomsFull.includes(eighth.data.error), eighth.data.error);
  assert.deepEqual(eighth.cookies.map(c => c.split('=')[0]), ['player'], '방을 못 만들면 게임 쿠키는 없음');

  // 다른 IP, IP를 알 수 없는 요청(로컬 개발)은 따로 센다
  assert.equal((await visit('198.51.100.9')).code, 200);
  assert.equal((await visit(null)).code, 200);

  // 15분 넘게 쉰 방은 세지 않는다 → 같은 IP에서 다시 만들 수 있다
  const oldest = db.sql.prepare("SELECT id FROM games WHERE ip_hash IS NOT NULL ORDER BY created_at LIMIT 1").get().id;
  db.sql.prepare('UPDATE games SET last_active_at = ? WHERE id = ?').run(Date.now() - 16 * 60 * 1000, oldest);
  assert.equal((await visit('203.0.113.7')).code, 200);

  const stored = db.sql.prepare('SELECT ip_hash FROM games').all().map(r => r.ip_hash);
  assert.ok(stored.every(h => h === null || /^[0-9a-f]{32}$/.test(h)), '해시만 저장');
  assert.ok(!JSON.stringify(stored).includes('203.0.113.7'), 'IP 원문은 저장하지 않는다');
});

test('휴면 만료: 15분 무응답이면 그 자리에서 차단(만료) 기록, 질문·제출 거절, 새 게임만 가능', async t => {
  const { thoughts } = await import('../lib/game/data/thoughts.mjs');
  const { db, request, ask, fixCast, jar } = start(t);
  await request('session');
  fixCast();
  await ask('kim', '쉬는 시간에 어디 계셨어요?');
  const old = jar.game;
  const row = () => db.sql.prepare('SELECT status, blocked_at, block_reason, last_active_at FROM games WHERE id = ?').get(old);

  db.sql.prepare('UPDATE games SET last_active_at = ? WHERE id = ?').run(Date.now() - 16 * 60 * 1000, old);
  const q = await ask('kim', '그다음엔요?');
  assert.equal(q.code, 410);
  assert.equal(q.data.closed, 'expired');
  assert.ok(thoughts.expired.includes(q.data.error), q.data.error);
  assert.equal(row().status, 'blocked_expired');
  assert.equal(row().block_reason, 'idle');
  assert.ok(row().blocked_at > 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM turns WHERE game_id = ?').get(old).n, 1, '대화 기록은 남는다');

  const sub = await request('submit', { npc: 'hwanggh', motive: '놀림에 대한 복수', requestId: 'expired-0001' });
  assert.equal(sub.code, 410);
  const snap = await request('session');
  assert.equal(snap.code, 200);
  assert.equal(snap.data.closed.reason, 'expired');
  assert.equal(snap.data.turns.length, 1, '차단돼도 기록은 보여 준다');
  assert.equal((await request('investigate', { spot: 'desk' })).code, 410);

  const fresh = await request('reset', {});
  assert.equal(fresh.code, 200);
  assert.notEqual(jar.game, old);
  assert.equal(row().status, 'blocked_expired', '차단된 방은 종료로 덮어쓰지 않는다');
  assert.equal((await request('session')).data.closed, undefined);

  // 관리자 차단
  db.sql.prepare("UPDATE games SET status = 'blocked_admin', blocked_at = ?, block_reason = 'admin' WHERE id = ?").run(Date.now(), jar.game);
  fixCast();
  const admin = await ask('kim', '쉬는 시간에 어디 계셨어요?');
  assert.equal(admin.code, 410);
  assert.equal(admin.data.closed, 'admin');
  assert.ok(thoughts.blockedAdmin.includes(admin.data.error));
});

test('마지막 활동 시각: 저장할 때 함께 갱신, 조회는 1분 간격으로만 쓴다, 제출하면 종료', async t => {
  const { db, request, ask, fixCast, jar } = start(t);
  await request('session');
  fixCast();
  const at = () => db.sql.prepare('SELECT last_active_at AS t, status FROM games WHERE id = ?').get(jar.game);
  const set = ms => db.sql.prepare('UPDATE games SET last_active_at = ? WHERE id = ?').run(ms, jar.game);

  const recent = Date.now() - 30 * 1000;
  set(recent);
  await request('session');
  assert.equal(at().t, recent, '1분이 안 지났으면 조회만으로는 쓰지 않는다');
  set(Date.now() - 90 * 1000);
  await request('session');
  assert.ok(Date.now() - at().t < 5000, '1분이 지났으면 갱신');

  set(recent);
  await ask('kim', '/모호');
  assert.ok(at().t > recent, '되묻기도 저장 때 갱신');
  await request('submit', { npc: 'hwanggh', motive: '놀림에 대한 복수', requestId: 'ended-0001' });
  assert.equal(at().status, 'ended');
});

test('접속 IP 허용 목록: 비어 있으면 제한 없음, 정확한 IP·IPv4 CIDR, API는 JSON 403', async () => {
  const { guardRequest, ipAllowed, parseAllowList } = await import('../lib/server/access.mjs');
  const { thoughts } = await import('../lib/game/data/thoughts.mjs');
  const req = (ip, path = '/api/session') => new Request('https://gotbong.test' + path, { headers: ip ? { 'cf-connecting-ip': ip } : {} });
  assert.equal(guardRequest(req('198.51.100.9'), {}), null);
  assert.equal(guardRequest(req('198.51.100.9'), { ALLOWED_IPS: ' ' }), null);
  const list = parseAllowList('203.0.113.7, 198.51.100.0/24, 2001:db8::1');
  assert.ok(ipAllowed('203.0.113.7', list));
  assert.ok(ipAllowed('198.51.100.200', list));
  assert.ok(ipAllowed('2001:DB8::1', list));
  assert.ok(!ipAllowed('198.51.101.1', list));
  assert.ok(!ipAllowed('203.0.113.70', list));
  assert.ok(ipAllowed('10.1.2.3', parseAllowList('0.0.0.0/0')));
  assert.ok(!ipAllowed(null, list));
  const env2 = { ALLOWED_IPS: '203.0.113.7' };
  assert.equal(guardRequest(req('203.0.113.7'), env2), null);
  const api = guardRequest(req('192.0.2.1'), env2);
  assert.equal(api.status, 403);
  assert.ok(thoughts.ipBlocked.includes((await api.json()).error));
  const page = guardRequest(req(null, '/play'), env2);
  assert.equal(page.status, 403);
  assert.match(page.headers.get('content-type'), /text\/html/);
});

test('빈 게임 정리: 오래되고 질문·요청·제출이 모두 없는 게임만 지운다', async t => {
  const { db, request, ask, fixCast } = start(t);
  const { openD1 } = await import('../lib/server/db-d1.mjs');
  const store = openD1(db);
  await request('session');
  fixCast();
  await ask('kim', '쉬는 시간에 어디 계셨어요?'); // 플레이한 게임
  const old = Date.now() - 8 * 24 * 3600 * 1000;
  for (const id of ['empty-old-0000000000000000000000000', 'empty-new-0000000000000000000000000', 'tried-old-0000000000000000000000000']) {
    await store.createGame({ id, cast: CAST, victim: '곽도현', state: {}, remaining: 20 });
  }
  db.sql.prepare("UPDATE games SET created_at = ? WHERE id != 'empty-new-0000000000000000000000000'").run(old);
  db.sql.prepare("INSERT INTO requests (game_id, id, fingerprint, response) VALUES ('tried-old-0000000000000000000000000', 'r1', 'x', '{}')").run();
  const deleted = await store.deleteEmptyGames({ olderThanMs: 7 * 24 * 3600 * 1000 });
  assert.equal(deleted, 1);
  const left = db.sql.prepare('SELECT id FROM games ORDER BY id').all().map(r => r.id);
  assert.ok(!left.includes('empty-old-0000000000000000000000000'));
  assert.equal(left.length, 3, '플레이한 게임·새 게임·요청이 있는 게임은 남는다');
});

test('최종 제출: 결과에 동기 채점 방식이 남는다', async t => {
  const { request, fixCast } = start(t);
  await request('session');
  fixCast();
  const right = await request('submit', { npc: 'hwanggh', motive: '놀림에 대한 복수', requestId: 'grader-0001' });
  assert.equal(right.data.result.grader, 'fixture');
  await request('reset', {});
  fixCast();
  const wrong = await request('submit', { npc: 'kim', motive: '놀림에 대한 복수', requestId: 'grader-0002' });
  assert.equal(wrong.data.result.grader, null, '범인이 틀리면 채점하지 않는다');
});

test('질문 차감: 센 질문 수만큼 차감, 4개 이상·남은 횟수 초과는 반려(차감 없음)', async t => {
  const { db, request, ask, fixCast } = start(t);
  await request('session');
  fixCast();
  const two = await ask('kim', '쉬는 시간에 어디 계셨어요? 누구 보셨어요?');
  assert.equal(two.data.status, 'accepted');
  assert.equal(two.data.used, 2);
  assert.equal(two.data.remaining, 18);

  const four = await ask('kim', '어디요? 언제요? 누구요? 왜요?');
  assert.equal(four.data.status, 'rejected');
  assert.equal(four.data.used, 0);
  assert.equal(four.data.remaining, 18);

  db.sql.prepare('UPDATE games SET remaining = 1').run();
  const over = await ask('kim', '어디요? 누구요?');
  assert.equal(over.data.status, 'rejected');
  assert.equal(over.data.remaining, 1);
  const last = await ask('kim', '쉬는 시간에 어디 계셨어요?');
  assert.equal(last.data.status, 'accepted');
  assert.equal(last.data.remaining, 0);
  assert.equal((await ask('kim', '하나 더요')).code, 409, '남은 질문이 없으면 물을 수 없다');
});

test('질문 차감: 차감 없는 응답이 연속 3번이면 다음 응답은 1회 차감', async t => {
  const { request, ask, fixCast } = start(t);
  await request('session');
  fixCast();
  for (let i = 0; i < 3; i++) {
    const r = await ask('kim', '/모호 ' + i);
    assert.equal(r.data.used, 0, i + '번째는 차감 없음');
    assert.equal(r.data.remaining, 20);
  }
  const fourth = await ask('kim', '/모호 3');
  assert.equal(fourth.data.status, 'clarify');
  assert.equal(fourth.data.used, 1, '네 번째 연속 무차감 응답은 1회 차감');
  const { thoughts } = await import('../lib/game/data/thoughts.mjs');
  assert.ok(thoughts.forcedCharge.some(t => fourth.data.message.endsWith(t)), '질문 한 번을 쓴 셈이라는 속마음: ' + fourth.data.message);
  assert.equal(fourth.data.remaining, 19);
  // 차감 후 연속 횟수는 초기화된다
  assert.equal((await ask('kim', '/모호 4')).data.used, 0);
  // 답한 메시지도 연속 횟수를 초기화한다
  await ask('kim', '쉬는 시간에 어디 계셨어요?');
  for (let i = 0; i < 3; i++) assert.equal((await ask('kim', '/모호 again ' + i)).data.used, 0);
});

test('속마음 안내: 되묻기·반려·오류는 고정 속마음 문장, 같은 기준 연속 3번 낮으면 힌트 한 번', async t => {
  const { thoughts, hints } = await import('../lib/game/data/thoughts.mjs');
  const { request, ask, fixCast } = start(t);
  await request('session');
  fixCast();
  const unclear = await ask('kim', '/모호');
  assert.ok(thoughts.unclear.includes(unclear.data.message), unclear.data.message);
  const many = await ask('kim', '어디요? 언제요? 누구요? 왜요?');
  assert.ok(thoughts.tooMany.includes(many.data.message), many.data.message);

  // 포괄적인 질문 3번 → 구체성(G3) 힌트 한 번
  const vague = [];
  for (const q of ['쉬는 시간에 뭐 하셨어요?', '그때 뭐 하셨는지 말해 주세요', '그냥 아는 거 다 말해 주세요']) vague.push((await ask('hwangyc', q)).data);
  assert.deepEqual(vague.map(v => v.status), ['accepted', 'accepted', 'accepted']);
  assert.equal(vague[0].thought, undefined);
  assert.equal(vague[1].thought, undefined);
  assert.ok(hints.G3.includes(vague[2].thought), '세 번째에 구체성 힌트: ' + vague[2].thought);
  const next = await ask('hwangyc', '또 뭐 하셨어요?');
  // 구체성(G3)을 통과하지 못한 질문은 S1을 세지 않으므로, 함께 차 있던 근거성(S2) 힌트가 다음에 나온다
  assert.ok(hints.S2.includes(next.data.thought), '다음 기준 하나만: ' + next.data.thought);

  // AI 연결 실패: 기술 원인 대신 속마음
  env.OPENAI_API_KEY = 'test-only';
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  const failed = await ask('kim', '쉬는 시간에 어디 계셨어요?');
  delete env.OPENAI_API_KEY;
  assert.equal(failed.code, 502);
  assert.ok(thoughts.aiError.includes(failed.data.error), failed.data.error);
});
