
import { env } from "cloudflare:workers";
import { openD1 } from "../../../lib/server/db-d1.mjs";
import {
  newCasting,
  initialState,
  publicCase,
} from "../../../lib/game/game.mjs";
import { modelFromEnv } from "../../../lib/ai/llm.mjs";
// 내부 역할과 사실 태그를 빼는 함수는 다른 API와 같은 것을 쓴다 (한 곳만 고치면 되도록).
import {
  GameHttpError,
  getGameId,
  limitGameCreation,
  publicGameKey,
  publicTurn,
} from "../../../lib/server/game-http.mjs";

const MAX_QUESTIONS = 20;

export async function GET(request) {
  try {
    const db = openD1(env.DB);
    const { mode } = modelFromEnv(env);

    // 1. 기존 게임 세션 쿠키 확인
    const cookie = getGameId(request);

    let game = cookie ? await db.getGame(cookie) : null;
    let newGameCreated = false;

    // 2. 기존 게임이 없으면 새 게임 생성
    if (!game) {
      // 쿠키 없는 요청이 반복돼 게임이 무한히 쌓이지 않게 IP당 생성 속도를 제한한다.
      await limitGameCreation(env, request);

      const id = crypto.randomUUID();
      const { cast, victim } = newCasting();

      game = await db.createGame({
        id,
        cast,
        victim,
        state: initialState(),
        remaining: MAX_QUESTIONS,
      });

      newGameCreated = true;
    }

    // 3. 저장된 NPC 대화 기록 조회
    const turns = await db.turns(game.id);

    // 4. 기존 AI 서버와 동일한 응답 형식 유지
    const snapshot = {
      ...publicCase(game),
      mode,
      gameKey: await publicGameKey(game.id),
      remaining: game.remaining,
      maxQuestions: MAX_QUESTIONS,
      turns: turns.map(publicTurn),
      result: game.result,
    };

    const response = Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

    // 5. 새 게임 생성 시 브라우저 쿠키 발급
    if (newGameCreated) {
      const secure = new URL(request.url).protocol === "https:";

      response.headers.set(
        "Set-Cookie",
        `game=${game.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure ? "; Secure" : ""}`
      );
    }

    return response;
  } catch (error) {
    if (error instanceof GameHttpError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    console.error("게임 세션 API 오류:", error);

    return Response.json(
      { error: "서버 오류입니다. 다시 시도해 주세요." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}