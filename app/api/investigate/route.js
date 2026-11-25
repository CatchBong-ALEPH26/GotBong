import { env } from "cloudflare:workers";

import { openD1 } from "../../../lib/server/db-d1.mjs";
import { clues } from "../../../lib/game/data/case.mjs";
import { fill } from "../../../lib/game/josa.mjs";
import { clueAtSpot, templateVars } from "../../../lib/game/game.mjs";
import {
  GameHttpError,
  getGameId,
  readGameJson,
  checkRoom,
  errorBody,
} from "../../../lib/server/game-http.mjs";
import { say } from "../../../lib/game/data/thoughts.mjs";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// 장면에서 사람마다 달라지는 곳(용의자 모니터)을 조사한다.
// 어느 모니터에 빌드 기록이 있는지는 범인을 알아야 정할 수 있으므로 화면이 아니라 서버가 판정한다.
// 읽기만 하고 저장하지 않는다 (찾은 단서는 화면의 localStorage에 남는다).
export async function POST(request) {
  try {
    const input = await readGameJson(request);
    const db = openD1(env.DB);

    const gameId = getGameId(request);
    const game = gameId ? await db.getGame(gameId) : null;

    if (!game) {
      throw new GameHttpError(409, say("noSession"));
    }

    // 조사도 방 활동이다: 차단된 방이면 거절, 진행 중이면 마지막 활동 시각 갱신(최소 간격)
    await checkRoom(db, game, { touch: true });

    if (typeof input.spot !== "string" || input.spot.length > 60) {
      throw new GameHttpError(400, "조사할 곳을 확인해 주세요.");
    }

    const clueId = clueAtSpot(game, input.spot);
    if (!clueId) return json({ clue: null });

    const clue = clues.find((c) => c.id === clueId);
    const vars = templateVars(game);

    return json({
      clue: { id: clue.id, title: fill(clue.title, vars), detail: fill(clue.detail, vars) },
    });
  } catch (error) {
    if (error instanceof GameHttpError) {
      return json(errorBody(error), error.status);
    }

    console.error("조사 API 오류:", error);
    return json({ error: say("serverError") }, 500);
  }
}
