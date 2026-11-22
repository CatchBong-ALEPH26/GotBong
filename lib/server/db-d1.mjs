/**
 * Cloudflare D1 데이터 접근 계층
 *
 * Workers의 env.DB 바인딩을 사용한다. 테스트는 test/api.test.mjs의 node:sqlite 대역을 쓴다.
 */
const parseGame = (row) =>
  row && {
    id: row.id,
    cast: JSON.parse(row.cast),
    victim: row.victim,
    state: JSON.parse(row.state),
    remaining: row.remaining,
    revision: row.revision,
    result: row.result ? JSON.parse(row.result) : null,
  };

const parseTurn = (row) =>
  row && {
    id: row.id,
    npc: row.npc,
    role: row.role,
    question: row.question,
    reply: row.reply,
    emotion: row.emotion,
    attach: row.attach ? JSON.parse(row.attach) : null,
    facts: JSON.parse(row.facts),
  };

export function openD1(db) {
  if (!db) {
    throw new Error("Cloudflare D1 바인딩(DB)이 없습니다.");
  }

  return {
    async createGame({ id, cast, victim, state, remaining }) {
    await db
        .prepare(
        `INSERT INTO games
        (id, cast, victim, state, remaining, result, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?)`
        )
        .bind(
        id,
        JSON.stringify(cast),
        victim,
        JSON.stringify(state),
        remaining,
        Date.now()
        )
        .run();

    return this.getGame(id);
    },

    async getGame(id) {
      const row = await db
        .prepare("SELECT * FROM games WHERE id = ?")
        .bind(id)
        .first();

      return parseGame(row);
    },

    async turns(gameId) {
      const { results } = await db
        .prepare("SELECT * FROM turns WHERE game_id = ? ORDER BY seq")
        .bind(gameId)
        .all();

      return results.map(parseTurn);
    },

    async turnsOf(gameId, npc) {
      const { results } = await db
        .prepare(
          "SELECT * FROM turns WHERE game_id = ? AND npc = ? ORDER BY seq"
        )
        .bind(gameId, npc)
        .all();

      return results.map(parseTurn);
    },

    async turn(gameId, id) {
      const row = await db
        .prepare("SELECT * FROM turns WHERE game_id = ? AND id = ?")
        .bind(gameId, id)
        .first();

      return parseTurn(row);
    },

    async getRequest(gameId, id) {
      return db
        .prepare(
          "SELECT fingerprint, response FROM requests WHERE game_id = ? AND id = ?"
        )
        .bind(gameId, id)
        .first();
    },


    /**
     * 게임 상태와 요청 기록을 원자적으로 저장한다.
     * revision이 일치하지 않으면 전체 저장을 취소한다.
     */
    async commit({
      gameId,
      expectedRevision,
      requestId,
      fingerprint,
      response,
      turn,
      state,
      remaining,
      result,
    }) {
      if (
        !Number.isInteger(expectedRevision) ||
        expectedRevision < 0
      ) {
        throw new Error("게임 revision 값이 올바르지 않습니다.");
      }

      if (
        state != null &&
        (!Number.isInteger(remaining) || remaining < 0)
      ) {
        throw new Error("남은 질문 횟수가 올바르지 않습니다.");
      }

      const statements = [];

      // 1. revision 확인 및 요청 ID 등록
      // revision이 다르면 fingerprint에 NULL이 들어가
      // NOT NULL 제약 조건에 의해 트랜잭션 전체가 실패한다.
      statements.push(
        db.prepare(
          `INSERT INTO requests
           (game_id, id, fingerprint, response)
           VALUES (
             ?,
             ?,
             (
               SELECT CASE
                 WHEN revision = ? AND result IS NULL
                 THEN ?
                 ELSE NULL
               END
               FROM games
               WHERE id = ?
             ),
             ?
           )`
        ).bind(
          gameId,
          requestId,
          expectedRevision,
          fingerprint,
          gameId,
          JSON.stringify(response)
        )
      );

      // 2. 게임 상태 갱신 및 revision 증가
      statements.push(
        db.prepare(
          `UPDATE games
           SET
             state = COALESCE(?, state),
             remaining = COALESCE(?, remaining),
             result = COALESCE(?, result),
             revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND result IS NULL`
        ).bind(
          state != null ? JSON.stringify(state) : null,
          remaining ?? null,
          result != null ? JSON.stringify(result) : null,
          gameId,
          expectedRevision
        )
      );

      // 3. NPC 질문과 답변 저장
      if (turn) {
        statements.push(
          db.prepare(
            `INSERT INTO turns
             (game_id, id, npc, role, question, reply,
              emotion, attach, facts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            gameId,
            turn.id,
            turn.npc,
            turn.role,
            turn.question,
            turn.reply,
            turn.emotion,
            turn.attach
              ? JSON.stringify(turn.attach)
              : null,
            JSON.stringify(turn.facts)
          )
        );
      }

      // 4. 모든 SQL을 하나의 트랜잭션으로 처리
      await db.batch(statements);
    },
  };
}