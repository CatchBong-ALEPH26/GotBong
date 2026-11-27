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

// 장면의 한 곳을 조사한다. 어디에 어떤 단서가 있는지는 모두 서버가 판정하고(사람 모니터는 범인 배정에 따라 달라짐),
// 찾은 단서는 games.clues_found 에 기록한다. 질문에는 여기 기록된 단서만 첨부할 수 있다.
// 기록은 항목 추가 한 문장이라 같은 곳을 여러 번 눌러도 한 번만 남고(멱등), revision 을 바꾸지 않아
// 답을 기다리던 질문 저장과 충돌하지 않는다. 그래서 요청 ID 기록은 쓰지 않는다.
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

    // 제출이 끝난 게임은 기록하지 않는다 (카드 내용은 보여 준다)
    if (!game.result) await db.addFoundClue(game.id, clueId);

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
