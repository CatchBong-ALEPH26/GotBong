// HTTP 계층: 라우팅, 쿠키 세션, 멱등성, 입력 검증. 게임 규칙은 game.mjs / pipeline.mjs 에 있다.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { characters } from '../data/characters.mjs';
import { clues, clueIds, culprit } from '../data/case.mjs';
import { fill } from './josa.mjs';
import { openDb } from './db.mjs';
import { LlmError, fixture } from './llm.mjs';
import { runQuestion, gradeMotive, ClarifyError } from './pipeline.mjs';
import {
  newCasting, initialState, publicCase, revealCast, truthText, motiveText, roleOf, templateVars
} from './game.mjs';

export const MAX_QUESTIONS = 20;
const MAX_INPUT = 500;

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']]
]);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'JSON 요청이 필요합니다.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 8192) chunks.push(chunk);
  }
  if (size > 8192) throw new HttpError(413, '요청이 너무 깁니다.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  throw new HttpError(400, '요청 형식을 확인해 주세요.');
}

/** 브라우저로 나가는 턴: 역할·사실 태그를 뺀다 */
const publicTurn = t => ({ id: t.id, npc: t.npc, question: t.question, reply: t.reply, emotion: t.emotion, attach: t.attach });

/**
 * @param {object} o
 * @param {string} [o.dbPath]
 * @param {Function} [o.model]   LLM 호출 함수 (llm.mjs)
 * @param {'gemini'|'fixture'} [o.mode]
 * @param {boolean} [o.debug]    응답에 debug 정보 포함 (로컬 전용)
 * @param {{cast?, victim?}} [o.fixed] 테스트용 고정 배정
 */
export function createApp({ dbPath = ':memory:', model = fixture, mode = 'fixture', debug = false, fixed = {} } = {}) {
  const db = openDb(dbPath);
  const busy = new Set();

  function createGame(res) {
    const id = randomUUID();
    const { cast, victim } = newCasting(fixed);
    res.setHeader('Set-Cookie', 'game=' + id + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000');
    return db.createGame({ id, cast, victim, state: initialState(), remaining: MAX_QUESTIONS });
  }

  function snapshot(game) {
    return {
      ...publicCase(game), mode, remaining: game.remaining, maxQuestions: MAX_QUESTIONS,
      turns: db.turns(game.id).map(publicTurn), result: game.result
    };
  }

  function debugInfo(game, state, extra) {
    if (!debug) return undefined;
    const vars = templateVars(game);
    return { cast: { A: vars.A, B: vars.B, C: vars.C, D: vars.D }, victim: game.victim, state, ...extra };
  }

  function resolveAttach(game, npc, attach) {
    if (attach == null) return null;
    if (typeof attach !== 'object' || typeof attach.id !== 'string') throw new HttpError(400, '첨부 형식이 올바르지 않습니다.');
    if (attach.type === 'clue') {
      if (!clueIds.includes(attach.id)) throw new HttpError(400, '없는 단서입니다.');
      const vars = templateVars(game);
      return { type: 'clue', id: attach.id, title: fill(clues.find(c => c.id === attach.id).title, vars) };
    }
    if (attach.type === 'turn') {
      const t = db.turn(game.id, attach.id);
      if (!t || t.npc === npc) throw new HttpError(400, '이 게임에서 다른 용의자가 한 발언을 선택해 주세요.');
      return { type: 'turn', id: t.id, npc: t.npc, reply: t.reply, facts: t.facts };
    }
    throw new HttpError(400, '첨부 종류가 올바르지 않습니다.');
  }

  async function question(game, input, requestId, fingerprint) {
    const { npc } = input;
    if (game.remaining <= 0) throw new HttpError(409, '남은 질문이 없습니다. 최종 추리를 제출할 수 있습니다.');
    const roleId = roleOf(game.cast, npc);
    const attach = resolveAttach(game, npc, input.attach);
    const history = db.turnsOf(game.id, npc);

    let r;
    try {
      r = await runQuestion({ model, game, roleId, question: input.question, attach, history });
    } catch (error) {
      if (error instanceof ClarifyError) {
        const response = { status: 'clarify', message: error.message, remaining: game.remaining };
        db.commit({ gameId: game.id, requestId, fingerprint, response });
        return response;
      }
      throw error;
    }

    const dbg = debugInfo(game, { ...game.state, [roleId]: r.state }, r.debug);
    if (!r.pass) {
      const response = { status: 'rejected', message: '답변을 만들지 못했습니다. 질문을 조금 바꿔 다시 물어봐 주세요. (질문 횟수는 줄지 않았습니다)', remaining: game.remaining };
      db.commit({ gameId: game.id, requestId, fingerprint, response });
      return { ...response, debug: dbg };
    }

    const publicAttach = attach && (attach.type === 'turn'
      ? { type: 'turn', id: attach.id, npc: attach.npc, reply: attach.reply }
      : attach);
    const turn = {
      id: randomUUID(), npc, role: roleId, question: input.question, reply: r.reply, emotion: r.emotion,
      attach: publicAttach, facts: r.disclosed
    };
    const remaining = game.remaining - 1;
    const response = { status: 'accepted', turn: publicTurn(turn), remaining };
    db.commit({
      gameId: game.id, requestId, fingerprint, response,
      turn, state: { ...game.state, [roleId]: r.state }, remaining
    });
    return { ...response, debug: dbg };
  }

  async function submit(game, input, requestId, fingerprint) {
    const roleId = roleOf(game.cast, input.npc);
    let match = false;
    if (roleId === culprit) match = (await gradeMotive({ model, reference: motiveText(game), answer: input.motive })).match;
    const result = { score: match ? 1 : 0, truth: truthText(game), cast: revealCast(game) };
    const response = { result };
    db.commit({ gameId: game.id, requestId, fingerprint, response, result });
    return response;
  }

  const server = createServer(async (req, res) => {
    try {
      const path = req.url?.split('?')[0];
      const asset = assets.get(path);
      if (req.method === 'GET' && asset) {
        const [filename, mime] = asset;
        const body = readFileSync(new URL('../public/' + filename, import.meta.url));
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(body);
      }
      const sessionRead = req.method === 'GET' && path === '/api/session';
      const mutation = req.method === 'POST' && ['/api/question', '/api/submit', '/api/reset'].includes(path);
      if (!sessionRead && !mutation) throw new HttpError(404, '경로를 찾을 수 없습니다.');

      const cookie = req.headers.cookie?.match(/(?:^|;\s*)game=([a-f0-9-]{36})(?:;|$)/)?.[1];
      const game = cookie ? db.getGame(cookie) : null;
      if (sessionRead) return json(res, 200, snapshot(game ?? createGame(res)));
      if (path === '/api/reset') {
        if (game && busy.has(game.id)) throw new HttpError(409, '앞선 요청이 처리 중입니다.');
        return json(res, 200, snapshot(createGame(res)));
      }
      if (!game) throw new HttpError(409, '게임 세션이 없습니다. 페이지를 새로고침해 주세요.');
      if (busy.has(game.id)) throw new HttpError(409, '앞선 요청이 처리 중입니다.');

      busy.add(game.id);
      try {
        const input = await readJson(req);
        const field = path === '/api/question' ? 'question' : 'motive';
        const { npc, requestId } = input;
        if (typeof npc !== 'string' || !characters[npc] || !roleOf(game.cast, npc) ||
            typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId) ||
            typeof input[field] !== 'string' || !input[field].trim() || input[field].length > MAX_INPUT) {
          throw new HttpError(400, `용의자와 입력 내용을 확인해 주세요. 최대 ${MAX_INPUT}자입니다.`);
        }
        input[field] = input[field].trim();
        const attachKey = input.attach ? input.attach.type + ':' + input.attach.id : null;
        const fingerprint = JSON.stringify([path, npc, input[field], attachKey]);

        const prior = db.getRequest(game.id, requestId);
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new HttpError(409, '요청 ID가 다른 입력에 사용됐습니다.');
          const response = JSON.parse(prior.response);
          if (field === 'question') response.remaining = db.getGame(game.id).remaining;
          return json(res, 200, response);
        }
        if (game.result) throw new HttpError(409, '이미 끝난 게임입니다.');
        const handler = field === 'question' ? question : submit;
        return json(res, 200, await handler(game, input, requestId, fingerprint));
      } finally {
        busy.delete(game.id);
      }
    } catch (error) {
      if (error instanceof LlmError) return json(res, 502, { error: error.message });
      if (!(error instanceof HttpError)) {
        console.error(error);
        return json(res, 500, { error: '서버 오류입니다. 다시 시도해 주세요.' });
      }
      json(res, error.status, { error: error.message });
    }
  });
  server.on('close', () => db.close());
  return server;
}
