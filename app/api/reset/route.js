import { env } from "cloudflare:workers";

import { openD1 } from "../../../lib/server/db-d1.mjs";

import {
  newCasting,
  initialState,
  publicCase,
} from "../../../lib/game/game.mjs";
import { modelFromEnv } from "../../../lib/ai/llm.mjs";
import { GameHttpError, readGameJson } from "../../../lib/server/game-http.mjs";

const MAX_QUESTIONS = 20;

// 기존 게임을 초기화하는 대신 새로운 게임을 생성한다.
// 이전 게임 기록은 D1에 그대로 보관한다.
export async function POST(request) {
  try {
    // 다른 사이트의 폼 전송으로 쿠키가 바뀌지 않도록 JSON 요청만 받는다.
    // (교차 사이트 폼은 application/json을 보낼 수 없다.)
    await readGameJson(request);

    const db = openD1(env.DB);
    const { mode } = modelFromEnv(env);

    // 1. 새로운 게임 ID 발급
    const id = crypto.randomUUID();

    // 2. NPC 역할과 피해자를 무작위로 배정
    const { cast, victim } = newCasting();

    // 3. 새로운 게임을 Cloudflare D1에 저장
    const game = await db.createGame({
      id,
      cast,
      victim,
      state: initialState(),
      remaining: MAX_QUESTIONS,
    });

    // 4. 기존 /api/session과 동일한 응답 형식
    // 역할 배정과 내부 상태는 브라우저에 노출하지 않는다.
    const snapshot = {
      ...publicCase(game),
      mode,
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

    // 5. 브라우저의 게임 세션 쿠키 변경
    const secure =
      new URL(request.url).protocol === "https:";

    response.headers.set(
      "Set-Cookie",
      `game=${game.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${
        secure ? "; Secure" : ""
      }`
    );

    // 6. 새로운 사건 정보 반환
    return response;

  } catch (error) {
    if (error instanceof GameHttpError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    console.error("새 게임 시작 API 오류:", error);

    return Response.json(
      {
        error: "새 게임을 시작하지 못했습니다. 다시 시도해 주세요.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}