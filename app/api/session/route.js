
import { env } from "cloudflare:workers";
import { openD1 } from "../../../lib/server/db-d1.mjs";
import { publicCase } from "../../../lib/game/game.mjs";
import { modelFromEnv } from "../../../lib/ai/llm.mjs";
import { say } from "../../../lib/game/data/thoughts.mjs";
// 내부 역할과 사실 태그를 빼는 함수는 다른 API와 같은 것을 쓴다 (한 곳만 고치면 되도록).
import {
  GameHttpError,
  errorBody,
  getGameId,
  getPlayerId,
  publicGameKey,
  publicTurn,
  closedInfo,
  checkRoom,
  gameCookie,
  playerCookie,
} from "../../../lib/server/game-http.mjs";
import { openRoom, MAX_QUESTIONS } from "../../../lib/server/rooms.mjs";

export async function GET(request) {
  try {
    const db = openD1(env.DB);
    const { mode } = modelFromEnv(env);
    const now = Date.now();

    // 1. 플레이어 번호(한 번 발급)와 기존 게임 쿠키 확인
    let player = getPlayerId(request);
    const newPlayer = !player;
    if (newPlayer) player = crypto.randomUUID();

    const cookie = getGameId(request);
    let game = cookie ? await db.getGame(cookie) : null;
    let newGameCreated = false;

    if (game) {
      // 2. 진행 중이면 마지막 활동 시각을 갱신하고(최소 간격), 휴면이면 그 자리에서 만료로 기록한다.
      //    차단된 방도 기록은 보여 주되 closed 로 알려 새 게임만 가능하게 한다.
      game = await checkRoom(db, game, { now, touch: true, allowClosed: true });
    } else {
      // 3. 기존 게임이 없으면 새 방 (사람당·전체 진행 중 방 수 제한)
      game = await openRoom(db, env, { player, now });
      newGameCreated = true;
    }

    // 4. 저장된 NPC 대화 기록 조회
    const turns = await db.turns(game.id);
    const closed = closedInfo(game, now);

    const snapshot = {
      ...publicCase(game),
      mode,
      gameKey: await publicGameKey(game.id),
      remaining: game.remaining,
      maxQuestions: MAX_QUESTIONS,
      turns: turns.map(publicTurn),
      result: game.result,
      // 선택 필드: 차단(만료·관리자)된 방이면 { reason, message }. 화면은 새 게임만 권한다.
      ...(closed && !game.result ? { closed } : {}),
    };

    const response = Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

    // 5. 새 게임·새 플레이어면 쿠키 발급
    if (newGameCreated) response.headers.append("Set-Cookie", gameCookie(request, game.id));
    if (newPlayer) response.headers.append("Set-Cookie", playerCookie(request, player));

    return response;
  } catch (error) {
    if (error instanceof GameHttpError) {
      return Response.json(errorBody(error), {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    console.error("게임 세션 API 오류:", error);

    return Response.json(
      { error: say("serverError") },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
