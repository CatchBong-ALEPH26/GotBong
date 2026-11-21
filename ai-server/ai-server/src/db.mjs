// SQLite 저장소 (node:sqlite, 외부 의존성 없음).

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 2;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // 스키마가 바뀌면 테스트 데이터뿐이므로 새로 만든다
  if (db.prepare('PRAGMA user_version').get().user_version !== SCHEMA_VERSION) {
    db.exec('DROP TABLE IF EXISTS turns; DROP TABLE IF EXISTS requests; DROP TABLE IF EXISTS games;');
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, cast TEXT NOT NULL, victim TEXT NOT NULL, state TEXT NOT NULL,
      remaining INTEGER NOT NULL, result TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turns (
      seq INTEGER PRIMARY KEY, game_id TEXT NOT NULL, id TEXT NOT NULL, npc TEXT NOT NULL, role TEXT NOT NULL,
      question TEXT NOT NULL, reply TEXT NOT NULL, emotion TEXT NOT NULL, attach TEXT, facts TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS turns_game ON turns(game_id, seq);
    CREATE UNIQUE INDEX IF NOT EXISTS turns_id ON turns(game_id, id);
    CREATE TABLE IF NOT EXISTS requests (
      game_id TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL,
      PRIMARY KEY (game_id, id)
    );
  `);

  const q = {
    getGame: db.prepare('SELECT * FROM games WHERE id = ?'),
    insertGame: db.prepare('INSERT INTO games VALUES (?, ?, ?, ?, ?, NULL, ?)'),
    updateGame: db.prepare('UPDATE games SET state = ?, remaining = ? WHERE id = ?'),
    setResult: db.prepare('UPDATE games SET result = ? WHERE id = ?'),
    turns: db.prepare('SELECT * FROM turns WHERE game_id = ? ORDER BY seq'),
    turnsOf: db.prepare('SELECT * FROM turns WHERE game_id = ? AND npc = ? ORDER BY seq'),
    turn: db.prepare('SELECT * FROM turns WHERE game_id = ? AND id = ?'),
    insertTurn: db.prepare('INSERT INTO turns (game_id, id, npc, role, question, reply, emotion, attach, facts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getRequest: db.prepare('SELECT fingerprint, response FROM requests WHERE game_id = ? AND id = ?'),
    saveRequest: db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)')
  };

  const parseGame = row => row && {
    id: row.id, cast: JSON.parse(row.cast), victim: row.victim, state: JSON.parse(row.state),
    remaining: row.remaining, result: row.result ? JSON.parse(row.result) : null
  };
  const parseTurn = row => row && {
    id: row.id, npc: row.npc, role: row.role, question: row.question, reply: row.reply, emotion: row.emotion,
    attach: row.attach ? JSON.parse(row.attach) : null, facts: JSON.parse(row.facts)
  };

  return {
    close: () => db.close(),
    getGame: id => parseGame(q.getGame.get(id)),
    createGame({ id, cast, victim, state, remaining }) {
      q.insertGame.run(id, JSON.stringify(cast), victim, JSON.stringify(state), remaining, Date.now());
      return this.getGame(id);
    },
    turns: gameId => q.turns.all(gameId).map(parseTurn),
    turnsOf: (gameId, npc) => q.turnsOf.all(gameId, npc).map(parseTurn),
    turn: (gameId, id) => parseTurn(q.turn.get(gameId, id)),
    getRequest: (gameId, id) => q.getRequest.get(gameId, id),
    /** 턴 저장·상태·횟수·요청 기록을 한 트랜잭션으로 */
    commit({ gameId, requestId, fingerprint, response, turn, state, remaining, result }) {
      db.exec('BEGIN');
      try {
        if (turn) {
          q.insertTurn.run(gameId, turn.id, turn.npc, turn.role, turn.question, turn.reply, turn.emotion,
            turn.attach ? JSON.stringify(turn.attach) : null, JSON.stringify(turn.facts));
        }
        if (state) q.updateGame.run(JSON.stringify(state), remaining, gameId);
        if (result) q.setResult.run(JSON.stringify(result), gameId);
        q.saveRequest.run(gameId, requestId, fingerprint, JSON.stringify(response));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}
