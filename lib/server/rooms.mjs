// 새 방 만들기 (세션 첫 접속, 새 게임 공통). 방 수 제한에 걸리면 속마음 안내로 거절한다.
import { newCasting, initialState } from "../game/game.mjs";
import { say } from "../game/data/thoughts.mjs";
import { GameHttpError, ROOM, maxActiveRooms } from "./game-http.mjs";

export const MAX_QUESTIONS = 20;

/**
 * @param {{ player: string, replacing?: string|null, now?: number }} opts
 *   replacing: 지금 방 ID. 새 방이 만들어지면 같은 트랜잭션에서 '종료'로 바뀐다.
 */
export async function openRoom(db, env, { player, replacing = null, now = Date.now() }) {
  const { cast, victim } = newCasting();
  const made = await db.startGame({
    id: crypto.randomUUID(),
    cast,
    victim,
    state: initialState(),
    remaining: MAX_QUESTIONS,
    player,
    replacing,
    now,
    activeSince: now - ROOM.IDLE_MS,
    maxTotal: maxActiveRooms(env),
    maxPerPlayer: ROOM.MAX_PER_PLAYER,
  });
  if (made.limited === "player") throw new GameHttpError(429, say("playerRoomsFull"));
  if (made.limited) throw new GameHttpError(503, say("roomsFull"));
  return made;
}
