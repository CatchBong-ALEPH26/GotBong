// Worker 진입점: vinext가 만든 화면·API 처리(fetch)에 접속 IP 확인과 예약 작업(scheduled)을 더한다.
import handler from "vinext/server/fetch-handler";
import { openD1 } from "../lib/server/db-d1.mjs";
import { guardRequest } from "../lib/server/access.mjs";
import { ROOM } from "../lib/server/game-http.mjs";

/** 질문 하나 없이 이만큼 지난 빈 게임은 정리한다 (팀 승인: 2026-11-24). */
const EMPTY_GAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const worker = {
  ...handler,

  fetch(request, env, ctx) {
    // 접속 IP 허용 목록 (ALLOWED_IPS 가 비어 있으면 제한 없음)
    const blocked = guardRequest(request, env);
    if (blocked) return blocked;
    return handler.fetch(request, env, ctx);
  },

  // cloudflare.config.ts 의 cron(매일 1회)이 부른다.
  async scheduled(controller, env, ctx) {
    const db = openD1(env.DB);
    ctx.waitUntil(
      Promise.all([
        // 휴면 방 차단(만료) 표시. 기록은 지우지 않는다 (요청 때도 그 자리에서 판단하므로 보조 정리)
        db
          .expireIdle({ before: Date.now() - ROOM.IDLE_MS })
          .then((n) => console.log(`휴면 방 만료 표시: ${n}개`))
          .catch((error) => console.error("휴면 방 만료 표시 실패:", error)),
        db
          .deleteEmptyGames({ olderThanMs: EMPTY_GAME_TTL_MS })
          .then((n) => console.log(`빈 게임 정리: ${n}개 삭제`))
          .catch((error) => console.error("빈 게임 정리 실패:", error)),
      ])
    );
  },
};

export default worker;
