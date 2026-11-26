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
    // 차감 없는 응답 연속 횟수(free), 기준별 연속 낮음 횟수(lows). migrations/0003
    tally: JSON.parse(row.tally ?? "{}"),
    // 방 관리. migrations/0004
    player: row.player ?? null,
    status: row.status ?? "active",
    lastActiveAt: row.last_active_at ?? row.created_at ?? null,
    blockedAt: row.blocked_at ?? null,
    blockReason: row.block_reason ?? null,
    // 현장에서 찾은 단서 카드 id. migrations/0006 (state 와 따로 저장한다)
    // 열이 아직 없는 D1(0006 적용 전)이면 null: 기록·첨부 확인을 건너뛰고 예전처럼 동작한다
    cluesFound: row.clues_found === undefined ? null : JSON.parse(row.clues_found ?? "[]"),
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
    // 제한 없이 방을 만든다 (테스트·관리용). 플레이어가 만드는 방은 startGame 을 쓴다.
    async createGame({ id, cast, victim, state, remaining, player = null, now = Date.now() }) {
      await db
        .prepare(
          `INSERT INTO games
           (id, cast, victim, state, remaining, result, created_at, player, status, last_active_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'active', ?)`
        )
        .bind(id, JSON.stringify(cast), victim, JSON.stringify(state), remaining, now, player, now)
        .run();

      return this.getGame(id);
    },

    /**
     * 새 방을 만든다. 방 수 제한은 INSERT 한 문장 안에서 확인해 동시에 만들어도 넘지 않는다.
     * - 서비스 전체 진행 중 방 < maxTotal, 이 플레이어의 진행 중 방 < maxPerPlayer,
     *   같은 접속 IP(ipHash)의 진행 중 방 < maxPerIp (ipHash 가 null 이면 IP별 제한 없음)
     * - 진행 중 = status 'active' 이고 마지막 활동이 activeSince 이후 (휴면 방은 세지 않는다)
     * - replacing(지금 방)은 세지 않고, 새 방이 만들어졌을 때만 '종료'로 바꾼다 (같은 트랜잭션)
     * @returns 만든 게임, 제한에 걸리면 { limited: 'player' | 'ip' | 'total' }
     */
    async startGame({ id, cast, victim, state, remaining, player, ipHash = null, replacing = null, now = Date.now(), activeSince, maxTotal, maxPerPlayer, maxPerIp }) {
      const other = replacing ?? "";
      await db.batch([
        db.prepare(
          `INSERT INTO games
           (id, cast, victim, state, remaining, result, created_at, player, status, last_active_at, ip_hash)
           SELECT ?, ?, ?, ?, ?, NULL, ?, ?, 'active', ?, ?
           WHERE (SELECT COUNT(*) FROM games
                  WHERE status = 'active' AND last_active_at > ? AND id != ?) < ?
             AND (SELECT COUNT(*) FROM games
                  WHERE status = 'active' AND player = ? AND last_active_at > ? AND id != ?) < ?
             AND (? IS NULL OR (SELECT COUNT(*) FROM games
                  WHERE status = 'active' AND ip_hash = ? AND last_active_at > ? AND id != ?) < ?)`
        ).bind(
          id, JSON.stringify(cast), victim, JSON.stringify(state), remaining, now, player, now, ipHash,
          activeSince, other, maxTotal,
          player, activeSince, other, maxPerPlayer,
          ipHash, ipHash, activeSince, other, maxPerIp ?? Number.MAX_SAFE_INTEGER
        ),
        db.prepare(
          `UPDATE games SET status = 'ended'
           WHERE id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM games WHERE id = ?)`
        ).bind(other, id),
      ]);

      const game = await this.getGame(id);
      if (game) return game;
      const mine = await db
        .prepare("SELECT COUNT(*) AS n FROM games WHERE status = 'active' AND player = ? AND last_active_at > ? AND id != ?")
        .bind(player, activeSince, other)
        .first();
      if ((mine?.n ?? 0) >= maxPerPlayer) return { limited: "player" };
      if (ipHash && maxPerIp) {
        const sameIp = await db
          .prepare("SELECT COUNT(*) AS n FROM games WHERE status = 'active' AND ip_hash = ? AND last_active_at > ? AND id != ?")
          .bind(ipHash, activeSince, other)
          .first();
        if ((sameIp?.n ?? 0) >= maxPerIp) return { limited: "ip" };
      }
      return { limited: "total" };
    },

    /** 마지막 활동 시각 갱신 (진행 중인 방만). 쓰기를 아끼려고 호출하는 쪽이 최소 간격을 둔다. */
    async touch(id, now = Date.now()) {
      await db
        .prepare("UPDATE games SET last_active_at = ? WHERE id = ? AND status = 'active'")
        .bind(now, id)
        .run();
    },

    /** 방 차단 (기록은 지우지 않는다). reason: 'idle'(휴면 만료) | 'admin' */
    async block(id, { reason = "idle", now = Date.now() } = {}) {
      await db
        .prepare(
          `UPDATE games SET status = ?, blocked_at = ?, block_reason = ?
           WHERE id = ? AND status = 'active'`
        )
        .bind(reason === "admin" ? "blocked_admin" : "blocked_expired", now, reason, id)
        .run();
    },

    /** 매일 정리: 마지막 활동이 before 보다 오래된 진행 중 방을 차단(만료)으로 표시한다. 지우지 않는다. */
    async expireIdle({ before, limit = 500, now = Date.now() }) {
      const result = await db
        .prepare(
          `UPDATE games SET status = 'blocked_expired', blocked_at = ?, block_reason = 'idle'
           WHERE id IN (
             SELECT id FROM games WHERE status = 'active' AND last_active_at < ? LIMIT ?
           )`
        )
        .bind(now, before, limit)
        .run();
      return result?.meta?.changes ?? 0;
    },

    // 아무도 플레이하지 않은 오래된 게임 정리 (팀 승인: 2026-11-24).
    // 대상: 만든 지 olderThanMs 이상 지났고, 제출하지 않았고, 대화(turns)도 요청 기록(requests)도 없는 게임.
    // 질문을 하나라도 한 게임은 남긴다. 한 번에 limit개까지.
    async deleteEmptyGames({ olderThanMs, limit = 500, now = Date.now() }) {
      const result = await db
        .prepare(
          `DELETE FROM games WHERE id IN (
            SELECT g.id FROM games g
            WHERE g.result IS NULL
              AND g.created_at < ?
              AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.game_id = g.id)
              AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.game_id = g.id)
            LIMIT ?
          )`
        )
        .bind(now - olderThanMs, limit)
        .run();

      return result?.meta?.changes ?? 0;
    },

    /**
     * 찾은 단서를 기록한다 (진행 중이고 제출 전인 방만). 이미 있으면 그대로 둔다.
     * 한 문장으로 끝나서 원자적이고, revision 을 바꾸지 않아 기다리던 질문 저장과 충돌하지 않는다.
     * 열이 없는 D1(0006 적용 전)이면 기록하지 않고 null 을 돌려준다 (배포와 마이그레이션 순서가 바뀌어도 조사가 멈추지 않게).
     * @returns 새로 기록했으면 true, 이미 있었으면 false, 기록할 열이 없으면 null
     */
    async addFoundClue(id, clueId) {
      try {
        const result = await db
          .prepare(
            `UPDATE games SET clues_found = json_insert(clues_found, '$[#]', ?)
             WHERE id = ? AND status = 'active' AND result IS NULL
               AND NOT EXISTS (SELECT 1 FROM json_each(games.clues_found) WHERE value = ?)`
          )
          .bind(clueId, id, clueId)
          .run();
        return (result?.meta?.changes ?? 0) > 0;
      } catch (error) {
        if (/no such column/i.test(String(error?.message ?? error))) return null;
        throw error;
      }
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
      tally,
      now = Date.now(),
    }) {
      if (
        !Number.isInteger(expectedRevision) ||
        expectedRevision < 0
      ) {
        throw new Error("게임 revision 값이 올바르지 않습니다.");
      }

      if (
        remaining != null &&
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
                 WHEN revision = ? AND result IS NULL AND status = 'active'
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
             tally = COALESCE(?, tally),
             -- 제출하면 종료. 저장할 때마다 마지막 활동 시각도 함께 갱신한다 (따로 쓰지 않음)
             status = CASE WHEN ? IS NOT NULL THEN 'ended' ELSE status END,
             last_active_at = ?,
             revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND result IS NULL
             AND status = 'active'`
        ).bind(
          state != null ? JSON.stringify(state) : null,
          remaining ?? null,
          result != null ? JSON.stringify(result) : null,
          tally != null ? JSON.stringify(tally) : null,
          result != null ? 1 : null,
          now,
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