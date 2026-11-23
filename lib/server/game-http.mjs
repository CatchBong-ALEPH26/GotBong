/**
 * GotBong - Cloudflare Workers API 공통 기능
 */

export class GameHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 요청 쿠키에서 게임 ID 추출
export function getGameId(request) {
  return (
    request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)game=([a-f0-9-]{36})(?=;|$)/i)?.[1] ??
    null
  );
}

// POST 요청의 JSON 형식 및 크기 검증
export async function readGameJson(request) {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim();

  if (contentType !== "application/json") {
    throw new GameHttpError(415, "JSON 요청이 필요합니다.");
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new GameHttpError(400, "요청 형식을 확인해 주세요.");
  }

  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.byteLength;

    if (size > 8192) {
      await reader.cancel();
      throw new GameHttpError(413, "요청이 너무 깁니다.");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();

  try {
    const data = JSON.parse(text || "{}");

    if (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data)
    ) {
      return data;
    }
  } catch {
    // JSON 파싱 실패
  }

  throw new GameHttpError(400, "요청 형식을 확인해 주세요.");
}

// 내부 역할과 사실 태그를 제외한 공개 대화 정보
export function publicTurn(turn) {
  return {
    id: turn.id,
    npc: turn.npc,
    question: turn.question,
    reply: turn.reply,
    emotion: turn.emotion,
    attach: turn.attach,
  };
}
// D1 저장(commit)이 실패했을 때의 복구.
// 같은 요청이 먼저 저장됐으면 그 응답을 돌려주고(재생), 다른 요청이 먼저 반영됐으면 409,
// 그 밖의 실패는 그대로 던진다. 저장에 성공하면 null.
export async function commitOrReplay(db, game, { requestId, fingerprint }, save) {
  try {
    await save();
    return null;
  } catch (error) {
    const saved = await db.getRequest(game.id, requestId);

    if (saved) {
      if (saved.fingerprint !== fingerprint) {
        throw new GameHttpError(409, "요청 ID가 다른 입력에 사용됐습니다.");
      }
      const response = JSON.parse(saved.response);
      if ("remaining" in response) {
        const latest = await db.getGame(game.id);
        if (latest) response.remaining = latest.remaining;
      }
      return response;
    }

    const latest = await db.getGame(game.id);
    if (latest?.result || latest?.revision !== game.revision) {
      throw new GameHttpError(409, "게임 상태가 변경됐습니다. 페이지를 새로고침해 주세요.");
    }

    throw error;
  }
}
