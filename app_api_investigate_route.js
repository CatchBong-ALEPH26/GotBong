import { env } from "cloudflare:workers";
import { openD1 } from "../../../lib/server/db-d1.mjs";
import { clues } from "../../../lib/game/data/case.mjs";
import { fill } from "../../../lib/game/josa.mjs";
import { clueAtSpot, templateVars } from "../../../lib/game/game.mjs";
import { discoverClue, publicInvestigation } from "../../../lib/game/contradictions.mjs";
import {
  GameHttpError, getGameId, readGameJson, checkRoom, commitOrReplay, errorBody
} from "../../../lib/server/game-http.mjs";
import { say } from "../../../lib/game/data/thoughts.mjs";

const json = (data, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" }
});

// All scene clues are now server-recorded. The API validates the hotspot and
// writes discovery + request ID + revision atomically in the existing games.state.
// No new database migration and no paid AI request are needed.
export async function POST(request) {
  try {
    const input = await readGameJson(request);
    const db = openD1(env.DB);
    const gameId = getGameId(request);
    const game = gameId ? await db.getGame(gameId) : null;
    if (!game) throw new GameHttpError(409, say("noSession"));
    await checkRoom(db, game, { touch: true });
    if (typeof input.spot !== "string" || input.spot.length > 60) {
      throw new GameHttpError(400, "조사할 곳을 확인해 주세요.");
    }
    const clueId = clueAtSpot(game, input.spot);
    if (!clueId) return json({ clue: null, investigation: publicInvestigation(game.state) });
    const clue = clues.find(c => c.id === clueId);
    if (!clue) throw new Error("현장 단서 매핑에 없는 카드: " + clueId);
    const vars = templateVars(game);
    const publicClue = { id: clue.id, title: fill(clue.title, vars), detail: fill(clue.detail, vars) };
    const state = discoverClue(game.state, clueId);
    const response = { clue: publicClue, investigation: publicInvestigation(state) };
    if (state === game.state) return json(response); // already found; no extra revision/write

    if (input.requestId != null && (typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))) {
      throw new GameHttpError(400, "조사 요청 번호를 확인해 주세요.");
    }
    const requestId = input.requestId ?? crypto.randomUUID();
    const fingerprint = JSON.stringify(["/api/investigate", input.spot]);
    const replay = await commitOrReplay(db, game, { requestId, fingerprint }, () => db.commit({
      gameId: game.id, expectedRevision: game.revision, requestId, fingerprint,
      response, state
    }));
    return json(replay ?? response);
  } catch (error) {
    if (error instanceof GameHttpError) return json(errorBody(error), error.status);
    console.error("조사 API 오류:", error);
    return json({ error: say("serverError") }, 500);
  }
}
