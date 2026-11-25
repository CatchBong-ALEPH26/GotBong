/**
 * GotBong - Cloudflare Workers API 공통 기능
 */
import { say } from "../game/data/thoughts.mjs";

export class GameHttpError extends Error {
  /** extra: 응답 본문에 덧붙일 선택 필드 (예: { closed: "expired" }) */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** 오류 응답 본문: { error, ...선택 필드 } */
export const errorBody = (error) => ({ error: error.message, ...(error.extra ?? {}) });

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
      throw new GameHttpError(409, say("conflict"));
    }

    throw error;
  }
}

// 브라우저가 이 게임의 메모를 따로 저장할 때 쓰는 키.
// 쿠키의 게임 ID(HttpOnly)는 노출하지 않고, 되돌릴 수 없는 해시의 앞부분만 준다.
export async function publicGameKey(gameId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gotbong:" + gameId));
  return [...new Uint8Array(digest)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── 방 관리 (docs/game/AI_REDESIGN_DECISIONS.md 7장) ─────────────────
// 새 게임 생성의 분당 제한(GAME_CREATE_LIMITER)은 더 이상 호출하지 않는다.
// 학원 IP 허용 목록(worker/index.js)을 전제로, 서버 기록의 진행 중 방 수로 제한한다.

export const ROOM = {
  /** 마지막 요청 후 이만큼 무응답이면 차단(만료) */
  IDLE_MS: 15 * 60 * 1000,
  /** 마지막 활동 시각 갱신 최소 간격 (조회만 하는 요청에서 쓰기 한도를 아끼려고) */
  TOUCH_MS: 60 * 1000,
  /** 한 사람(플레이어 번호)당 진행 중 방 */
  MAX_PER_PLAYER: 2,
  /** 서비스 전체 동시 진행 중 방 기본값. 환경 변수 MAX_ACTIVE_ROOMS 로 바꿀 수 있다 */
  MAX_TOTAL: 30,
};

export function maxActiveRooms(env) {
  const n = Number(env?.MAX_ACTIVE_ROOMS);
  return Number.isInteger(n) && n > 0 ? n : ROOM.MAX_TOTAL;
}

// 요청 쿠키에서 플레이어 번호 추출 (한 번 발급, 방 수를 세는 데만 쓴다)
export function getPlayerId(request) {
  return (
    request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)player=([a-f0-9-]{36})(?=;|$)/i)?.[1] ?? null
  );
}

const secureFlag = (request) => (new URL(request.url).protocol === "https:" ? "; Secure" : "");

export const gameCookie = (request, id) =>
  `game=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureFlag(request)}`;

export const playerCookie = (request, id) =>
  `player=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secureFlag(request)}`;

const CLOSED = { blocked_expired: "expired", blocked_admin: "admin" };

/**
 * 방이 아직 쓸 수 있는지 확인한다. 휴면 만료는 정리 작업이 아니라 요청이 온 그 자리에서 판단해 기록한다.
 * 차단된 방이면 410 + 속마음 안내 + closed 를 던진다 (새 게임만 가능).
 * @param {{ touch?: boolean, allowClosed?: boolean }} opts touch=true 면 최소 간격이 지났을 때 마지막 활동 시각을 갱신한다
 *   (질문·제출은 저장(commit) 때 함께 갱신하므로 false). allowClosed=true 면 차단돼도 던지지 않는다(세션 조회용)
 */
export async function checkRoom(db, game, { now = Date.now(), touch = false, allowClosed = false } = {}) {
  let status = game.status;
  if (status === "active" && game.lastActiveAt != null && now - game.lastActiveAt > ROOM.IDLE_MS) {
    await db.block(game.id, { reason: "idle", now });
    status = "blocked_expired";
  }
  const closed = CLOSED[status];
  if (closed && !allowClosed) {
    throw new GameHttpError(410, say(closed === "admin" ? "blockedAdmin" : "expired"), { closed });
  }
  if (touch && status === "active" && (game.lastActiveAt == null || now - game.lastActiveAt >= ROOM.TOUCH_MS)) {
    await db.touch(game.id, now);
  }
  return { ...game, status };
}

/** 방 상태를 화면용 선택 필드로: 차단된 방이면 { reason, message } */
export function closedInfo(game, now = Date.now()) {
  let status = game.status;
  if (status === "active" && game.lastActiveAt != null && now - game.lastActiveAt > ROOM.IDLE_MS) status = "blocked_expired";
  const reason = CLOSED[status];
  return reason ? { reason, message: say(reason === "admin" ? "blockedAdmin" : "expired") } : null;
}
