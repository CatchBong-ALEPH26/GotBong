import { env } from "cloudflare:workers";

import { openD1 } from "../../../lib/server/db-d1.mjs";
import { characters } from "../../../lib/game/data/characters.mjs";
import { culprit } from "../../../lib/game/data/case.mjs";

import {
  roleOf,
  motiveText,
  truthText,
  revealCast,
} from "../../../lib/game/game.mjs";

import { modelFromEnv, LlmError } from "../../../lib/ai/llm.mjs";
import { gradeMotive } from "../../../lib/ai/pipeline.mjs";

import {
  GameHttpError,
  getGameId,
  readGameJson,
} from "../../../lib/server/game-http.mjs";

const MAX_INPUT = 500;

// JSON 응답 공통 함수
function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  try {
    const db = openD1(env.DB);

    // 1. 쿠키로 현재 게임을 찾는다.
    const gameId = getGameId(request);
    const game = gameId ? await db.getGame(gameId) : null;

    if (!game) {
      throw new GameHttpError(
        409,
        "게임 세션이 없습니다. 페이지를 새로고침해 주세요."
      );
    }

    // 2. 최종 제출 입력을 검사한다.
    const input = await readGameJson(request);
    const { npc, requestId } = input;

    if (
      typeof npc !== "string" ||
      !Object.hasOwn(characters, npc) ||
      !roleOf(game.cast, npc) ||
      typeof requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId) ||
      typeof input.motive !== "string" ||
      !input.motive.trim() ||
      input.motive.length > MAX_INPUT
    ) {
      throw new GameHttpError(
        400,
        `용의자와 범행 동기를 확인해 주세요. 최대 ${MAX_INPUT}자입니다.`
      );
    }

    const motive = input.motive.trim();

    // 기존 Node API와 동일한 fingerprint 형식을 유지한다.
    const fingerprint = JSON.stringify([
      "/api/submit",
      npc,
      motive,
      null,
    ]);

    // 3. 같은 요청 ID를 재시도한 경우
    // 저장된 결과를 그대로 반환한다.
    const prior = await db.getRequest(game.id, requestId);

    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new GameHttpError(
          409,
          "요청 ID가 다른 입력에 사용됐습니다."
        );
      }

      return json(JSON.parse(prior.response));
    }

    // 이미 종료된 게임에는 다시 제출할 수 없다.
    if (game.result) {
      throw new GameHttpError(
        409,
        "이미 끝난 게임입니다."
      );
    }

    // 4. 범인이 맞을 때만 동기를 채점한다.
    const roleId = roleOf(game.cast, npc);
    let match = false;

    if (roleId === culprit) {
      const { model } = modelFromEnv(env);

      const graded = await gradeMotive({
        model,
        reference: motiveText(game),
        answer: motive,
      });

      match = graded.match === true;
    }

    // 5. 최종 판정 결과 생성
    const result = {
      score: match ? 1 : 0,
      truth: truthText(game),
      cast: revealCast(game),
    };

    const response = { result };

    // 6. 결과와 요청 이력을
    // 하나의 D1 트랜잭션으로 저장한다.
    try {
      await db.commit({
        gameId: game.id,
        expectedRevision: game.revision,
        requestId,
        fingerprint,
        response,
        result,
      });
    } catch (error) {
      // 동시에 같은 요청이 성공했다면
      // 저장된 결과를 재사용한다.
      const saved = await db.getRequest(
        game.id,
        requestId
      );

      if (saved) {
        if (saved.fingerprint !== fingerprint) {
          throw new GameHttpError(
            409,
            "요청 ID가 다른 입력에 사용됐습니다."
          );
        }

        return json(JSON.parse(saved.response));
      }

      // 다른 질문 또는 최종 제출이 먼저 반영된 경우
      const latest = await db.getGame(game.id);

      if (
        latest?.result ||
        latest?.revision !== game.revision
      ) {
        throw new GameHttpError(
          409,
          "게임 상태가 변경됐습니다. 페이지를 새로고침해 주세요."
        );
      }

      throw error;
    }

    // 7. 최종 결과 반환
    return json(response);

  } catch (error) {
    // 입력 오류, 세션 오류, 중복 요청 등
    if (error instanceof GameHttpError) {
      return json(
        { error: error.message },
        error.status
      );
    }

    // AI 모델 호출 실패
    if (error instanceof LlmError) {
      return json(
        { error: error.message },
        502
      );
    }

    // 예상하지 못한 서버 오류
    console.error("범인 지목 API 오류:", error);

    return json(
      {
        error: "서버 오류입니다. 다시 시도해 주세요.",
      },
      500
    );
  }
}