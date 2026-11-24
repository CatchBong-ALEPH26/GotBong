// Worker 진입점: vinext가 만든 화면·API 처리(fetch)에 예약 작업(scheduled)을 더한다.
import handler from "vinext/server/fetch-handler";
import { openD1 } from "../lib/server/db-d1.mjs";

/** 질문 하나 없이 이만큼 지난 빈 게임은 정리한다 (팀 승인: 2026-11-24). */
const EMPTY_GAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const worker = {
  ...handler,

  fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
  },

  // cloudflare.config.ts 의 cron(매일 1회)이 부른다.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      openD1(env.DB)
        .deleteEmptyGames({ olderThanMs: EMPTY_GAME_TTL_MS })
        .then((n) => console.log(`빈 게임 정리: ${n}개 삭제`))
        .catch((error) => console.error("빈 게임 정리 실패:", error))
    );
  },
};

export default worker;
