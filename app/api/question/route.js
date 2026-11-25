import { env } from "cloudflare:workers";

import { openD1 } from "../../../lib/server/db-d1.mjs";
import { characters } from "../../../lib/game/data/characters.mjs";
import { clues, clueIds } from "../../../lib/game/data/case.mjs";
import { fill } from "../../../lib/game/josa.mjs";
import { roleOf, templateVars } from "../../../lib/game/game.mjs";
import { modelFromEnv, LlmError } from "../../../lib/ai/llm.mjs";
import { runQuestion } from "../../../lib/ai/pipeline.mjs";

import {
  GameHttpError,
  getGameId,
  readGameJson,
  publicTurn,
  commitOrReplay,
} from "../../../lib/server/game-http.mjs";

const MAX_INPUT = 500;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// 첨부된 단서 또는 다른 NPC의 증언 확인
async function resolveAttach(db, game, npc, attach) {
  if (attach == null) return null;

  if (
    typeof attach !== "object" ||
    Array.isArray(attach) ||
    typeof attach.id !== "string"
  ) {
    throw new GameHttpError(400, "첨부 형식이 올바르지 않습니다.");
  }

  if (attach.type === "clue") {
    if (!clueIds.includes(attach.id)) {
      throw new GameHttpError(400, "없는 단서입니다.");
    }

    const clue = clues.find((c) => c.id === attach.id);

    return {
      type: "clue",
      id: attach.id,
      title: fill(clue.title, templateVars(game)),
    };
  }

  if (attach.type === "turn") {
    const turn = await db.turn(game.id, attach.id);

    if (!turn || turn.npc === npc) {
      throw new GameHttpError(
        400,
        "이 게임에서 다른 용의자가 한 발언을 선택해 주세요."
      );
    }

    return {
      type: "turn",
      id: turn.id,
      npc: turn.npc,
      reply: turn.reply,
      facts: turn.facts,
    };
  }

  throw new GameHttpError(400, "첨부 종류가 올바르지 않습니다.");
}

export async function POST(request) {
  try {
    const db = openD1(env.DB);

    // 1. 게임 세션 확인
    const gameId = getGameId(request);
    const game = gameId ? await db.getGame(gameId) : null;

    if (!game) {
      throw new GameHttpError(
        409,
        "게임 세션이 없습니다. 페이지를 새로고침해 주세요."
      );
    }

    // 2. 요청 데이터 검증
    const input = await readGameJson(request);
    const { npc, requestId } = input;

    if (
      typeof npc !== "string" ||
      !Object.hasOwn(characters, npc) ||
      !roleOf(game.cast, npc) ||
      typeof requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId) ||
      typeof input.question !== "string" ||
      !input.question.trim() ||
      input.question.length > MAX_INPUT
    ) {
      throw new GameHttpError(
        400,
        `용의자와 질문을 확인해 주세요. 최대 ${MAX_INPUT}자입니다.`
      );
    }

    const question = input.question.trim();

    // 3. 중복 요청 판별용 지문 생성
    // 첨부 모양을 먼저 확인해야, 잘못된 첨부가 예전 응답의 재생으로 새지 않는다.
    if (
      input.attach != null &&
      (typeof input.attach !== "object" ||
        Array.isArray(input.attach) ||
        typeof input.attach.type !== "string" ||
        typeof input.attach.id !== "string")
    ) {
      throw new GameHttpError(400, "첨부 형식이 올바르지 않습니다.");
    }

    const attachKey = input.attach
      ? `${input.attach.type}:${input.attach.id}`
      : null;

    const fingerprint = JSON.stringify([
      "/api/question",
      npc,
      question,
      attachKey,
    ]);

    // 4. 이전에 처리한 요청인지 확인
    const prior = await db.getRequest(game.id, requestId);

    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new GameHttpError(
          409,
          "요청 ID가 다른 입력에 사용됐습니다."
        );
      }

      const response = JSON.parse(prior.response);
      const latest = await db.getGame(game.id);
      response.remaining = latest.remaining;

      return json(response);
    }

    if (game.result) {
      throw new GameHttpError(409, "이미 끝난 게임입니다.");
    }

    if (game.remaining <= 0) {
      throw new GameHttpError(
        409,
        "남은 질문이 없습니다. 최종 추리를 제출할 수 있습니다."
      );
    }

    // 5. NPC 역할, 첨부 증거, 이전 대화 확인
    const roleId = roleOf(game.cast, npc);
    const attach = await resolveAttach(
      db,
      game,
      npc,
      input.attach
    );
    const history = await db.turnsOf(game.id, npc);

    // 6. 질문 처리 (해금 판정 → 메인 모델 1회 → 답변 검증)
    const { model } = modelFromEnv(env);

    const answer = await runQuestion({
      model,
      game,
      roleId,
      question,
      attach,
      history,
      remaining: game.remaining,
    });

    // 7. 되묻기·반려·답변 검증 실패는 질문 횟수를 줄이지 않는다
    if (answer.status !== "answered" || !answer.pass) {
      const response = {
        status: answer.status === "clarify" ? "clarify" : "rejected",
        message:
          answer.status === "clarify"
            ? "무엇을 묻는지 조금 더 구체적으로 적어 주세요."
            : answer.status === "rejected"
              ? "한 번에 물을 수 있는 질문 수를 넘었습니다."
              : "답변을 만들지 못했습니다. 질문을 조금 바꿔 다시 물어봐 주세요. (질문 횟수는 줄지 않았습니다)",
        remaining: game.remaining,
      };

      const replay = await commitOrReplay(db, game, { requestId, fingerprint }, () =>
        db.commit({
          gameId: game.id,
          requestId,
          fingerprint,
          response,
          expectedRevision: game.revision,
        })
      );

      return json(replay ?? response);
    }

    // 8. 클라이언트에 공개할 첨부 정보
    const publicAttach =
      attach?.type === "turn"
        ? {
            type: "turn",
            id: attach.id,
            npc: attach.npc,
            reply: attach.reply,
          }
        : attach;

    // 9. NPC 대화 데이터 생성
    const turn = {
      id: crypto.randomUUID(),
      npc,
      role: roleId,
      question,
      reply: answer.reply,
      emotion: answer.emotion,
      attach: publicAttach,
      facts: answer.disclosed,
    };

    const remaining = game.remaining - 1;

    const response = {
      status: "accepted",
      turn: publicTurn(turn),
      remaining,
    };

    // 10. 대화·상태·요청 기록을 D1에 저장
    // 동시에 다른 질문이 먼저 저장됐으면 409, 같은 요청이 먼저 저장됐으면 그 응답을 재생한다.
    const replay = await commitOrReplay(db, game, { requestId, fingerprint }, () =>
      db.commit({
        gameId: game.id,
        expectedRevision: game.revision,
        requestId,
        fingerprint,
        response,
        turn,
        state: {
          ...game.state,
          [roleId]: answer.state,
        },
        remaining,
      })
    );

    return json(replay ?? response);
  } catch (error) {
    if (error instanceof GameHttpError) {
      return json({ error: error.message }, error.status);
    }

    if (error instanceof LlmError) {
      return json({ error: error.message }, 502);
    }

    console.error("NPC 질문 API 오류:", error);

    return json(
      { error: "서버 오류입니다. 다시 시도해 주세요." },
      500
    );
  }
}