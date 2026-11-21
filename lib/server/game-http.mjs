/**
 * GotBong - Cloudflare Workers API 공통 기능
 * 기존 Node.js http.mjs는 수정하지 않는다.
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