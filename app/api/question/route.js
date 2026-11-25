import { env } from "cloudflare:workers";

import { openD1 } from "../../../lib/server/db-d1.mjs";
import { characters } from "../../../lib/game/data/characters.mjs";
import { clues, clueIds } from "../../../lib/game/data/case.mjs";
import { fill } from "../../../lib/game/josa.mjs";
import { roleOf, templateVars, chargeFor, lowFlags, updateLows } from "../../../lib/game/game.mjs";
import { modelFromEnv, LlmError } from "../../../lib/ai/llm.mjs";
import { runQuestion } from "../../../lib/ai/pipeline.mjs";
import { say, hints, pickThought, rejectThought } from "../../../lib/game/data/thoughts.mjs";

import {
  GameHttpError,
  getGameId,
  readGameJson,
  publicTurn,
  commitOrReplay,
  checkRoom,
  errorBody,
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
      throw new GameHttpError(409, say("noSession"));
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
      throw new GameHttpError(409, say("gameOver", game.revision));
    }

    // 차단(휴면 만료·관리자)된 방은 질문을 받지 않는다 (410 + 속마음 + closed)
    await checkRoom(db, game);

    if (game.remaining <= 0) {
      throw new GameHttpError(409, say("noQuestionsLeft", game.revision));
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

    // 7. 되묻기·반려·답변 검증 실패: 질문 횟수를 줄이지 않는다.
    //    단 차감 없는 응답이 이미 연속 3번이면 이번 응답은 1회 차감한다 (무한 반복 방지).
    const answered = answer.status === "answered" && answer.pass;
    const charge = chargeFor({ answered, count: answer.count, free: game.tally.free ?? 0 });
    const remaining = game.remaining - charge.used;
    const tally = { ...game.tally, free: charge.free };

    // 반복 실패 힌트: 답한 메시지만 센다 (게임 단위, 기준별 연속 3번 낮으면 한 번)
    let thought;
    if (answered) {
      const { lows, hint } = updateLows(game.tally.lows, lowFlags(answer.scored));
      tally.lows = lows;
      if (hint) thought = pickThought(hints[hint], game.revision);
    }

    if (!answered) {
      const response = {
        status: answer.status === "clarify" ? "clarify" : "rejected",
        // 탐정 속마음 고정 문장. 차감 여부는 used 로 알려 준다 (화면이 한 줄로 표시)
        message:
          answer.status === "clarify"
            ? say("unclear", game.revision)
            : answer.status === "rejected"
              ? rejectThought(answer.reason, game.remaining, game.revision)
              : say("answerFailed", game.revision),
        remaining,
        used: charge.used,
      };

      const replay = await commitOrReplay(db, game, { requestId, fingerprint }, () =>
        db.commit({
          gameId: game.id,
          requestId,
          fingerprint,
          response,
          expectedRevision: game.revision,
          remaining,
          tally,
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

    // 센 질문 수만큼 차감한다 (판정 단계에서 남은 횟수 이하인 것을 확인했다)
    const response = {
      status: "accepted",
      turn: publicTurn(turn),
      remaining,
      used: charge.used,
      ...(thought ? { thought } : {}),
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
        tally,
      })
    );

    return json(replay ?? response);
  } catch (error) {
    if (error instanceof GameHttpError) {
      return json(errorBody(error), error.status);
    }

    // 기술적인 원인은 로그에만 남기고 화면에는 속마음만 보낸다
    if (error instanceof LlmError) {
      console.error("NPC 질문 AI 호출 실패:", error.message);
      return json({ error: say("aiError") }, 502);
    }

    console.error("NPC 질문 API 오류:", error);

    return json({ error: say("serverError") }, 500);
  }
}