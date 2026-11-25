import { env } from "cloudflare:workers";

import { openD1 } from "../../../lib/server/db-d1.mjs";

import { publicCase } from "../../../lib/game/game.mjs";
import { modelFromEnv } from "../../../lib/ai/llm.mjs";
import { say } from "../../../lib/game/data/thoughts.mjs";
import {
  GameHttpError,
  errorBody,
  getGameId,
  getPlayerId,
  publicGameKey,
  readGameJson,
  gameCookie,
  playerCookie,
} from "../../../lib/server/game-http.mjs";
import { openRoom, MAX_QUESTIONS } from "../../../lib/server/rooms.mjs";

// 새 게임: 지금 방을 '종료'로 표시하고 새 방을 만든다 (같은 트랜잭션, 방 수 제한 확인).
// 이전 게임 기록은 D1에 그대로 보관한다. 차단(만료)된 방에서도 새 게임은 시작할 수 있다.
export async function POST(request) {
  try {
    // 다른 사이트의 폼 전송으로 쿠키가 바뀌지 않도록 JSON 요청만 받는다.
    // (교차 사이트 폼은 application/json을 보낼 수 없다.)
    await readGameJson(request);

    const db = openD1(env.DB);
    const { mode } = modelFromEnv(env);

    let player = getPlayerId(request);
    const newPlayer = !player;
    if (newPlayer) player = crypto.randomUUID();

    // 1. 새 방 생성 (지금 방은 세지 않고, 만들어지면 종료로)
    const game = await openRoom(db, env, { player, replacing: getGameId(request) });

    // 2. 기존 /api/session과 동일한 응답 형식
    // 역할 배정과 내부 상태는 브라우저에 노출하지 않는다.
    const snapshot = {
      ...publicCase(game),
      mode,
      gameKey: await publicGameKey(game.id),
      remaining: game.remaining,
      maxQuestions: MAX_QUESTIONS,
      turns: [],
      result: null,
    };

    const response = Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

    // 3. 브라우저의 게임 세션 쿠키 변경
    response.headers.append("Set-Cookie", gameCookie(request, game.id));
    if (newPlayer) response.headers.append("Set-Cookie", playerCookie(request, player));

    return response;

  } catch (error) {
    if (error instanceof GameHttpError) {
      return Response.json(errorBody(error), {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    console.error("새 게임 시작 API 오류:", error);

    return Response.json(
      { error: say("serverError") },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
