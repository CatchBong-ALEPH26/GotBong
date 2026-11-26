
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
  ipKey,
  publicGameKey,
  publicTurn,
  closedInfo,
  checkRoom,
  gameCookie,
  playerCookie,
} from "../../../lib/server/game-http.mjs";
import { openRoom, MAX_QUESTIONS } from "../../../lib/server/rooms.mjs";

export async function GET(request) {
  // 플레이어 번호는 한 번 발급한다. 방을 만들지 못한 응답(429)에도 붙여 다음 요청부터 같은 사람으로 센다.
  let player = getPlayerId(request);
  const newPlayer = !player;
  if (newPlayer) player = crypto.randomUUID();

  try {
    const db = openD1(env.DB);
    const { mode } = modelFromEnv(env);
    const now = Date.now();

    // 1. 기존 게임 쿠키 확인
    const cookie = getGameId(request);
    let game = cookie ? await db.getGame(cookie) : null;
    let newGameCreated = false;

    if (game) {
      // 2. 진행 중이면 마지막 활동 시각을 갱신하고(최소 간격), 휴면이면 그 자리에서 만료로 기록한다.
      //    차단된 방도 기록은 보여 주되 closed 로 알려 새 게임만 가능하게 한다.
      game = await checkRoom(db, game, { now, touch: true, allowClosed: true });
    } else {
      // 3. 기존 게임이 없으면 새 방 (사람당·전체 진행 중 방 수 제한)
      game = await openRoom(db, env, { player, ipHash: await ipKey(request), now });
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
      // 현장에서 찾은 단서 카드 id (서버 기록). 찾기 전 카드 내용은 clues 에 이미 있으므로 새로 드러나는 정보는 없다
      found: game.cluesFound,
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
      const response = Response.json(errorBody(error), {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
      // 방 가득참(429 + code)일 때만 붙인다. 다른 오류(예: 다른 사이트의 폼 전송 415)에는 붙이지 않는다:
      // SameSite=Strict 라 그런 요청엔 기존 쿠키가 없어 새 번호로 덮어쓰게 되기 때문이다.
      if (newPlayer && error.extra?.code) response.headers.append("Set-Cookie", playerCookie(request, player));
      return response;
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
