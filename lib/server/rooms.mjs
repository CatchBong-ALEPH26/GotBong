// 새 방 만들기 (세션 첫 접속, 새 게임 공통). 방 수 제한에 걸리면 속마음 안내로 거절한다.
import { newCasting, initialState } from "../game/game.mjs";
import { say } from "../game/data/thoughts.mjs";
import { GameHttpError, ROOM, maxActiveRooms } from "./game-http.mjs";

export const MAX_QUESTIONS = 20;

/**
 * @param {{ player: string, ipHash?: string|null, replacing?: string|null, now?: number }} opts
 *   ipHash: 접속 IP 해시(ipKey). null 이면 IP별 제한 없음.
 *   replacing: 지금 방 ID. 새 방이 만들어지면 같은 트랜잭션에서 '종료'로 바뀐다.
 */
export async function openRoom(db, env, { player, ipHash = null, replacing = null, now = Date.now() }) {
  const { cast, victim } = newCasting();
  const made = await db.startGame({
    id: crypto.randomUUID(),
    cast,
    victim,
    state: initialState(cast._alibi),
    remaining: MAX_QUESTIONS,
    player,
    ipHash,
    replacing,
    now,
    activeSince: now - ROOM.IDLE_MS,
    maxTotal: maxActiveRooms(env),
    maxPerPlayer: ROOM.MAX_PER_PLAYER,
    maxPerIp: ROOM.MAX_PER_IP,
  });
  // 모두 429 + 속마음 + 선택 필드 code 로 구분한다
  if (made.limited === "player") throw new GameHttpError(429, say("playerRoomsFull"), { code: "player_rooms_full" });
  if (made.limited === "ip") throw new GameHttpError(429, say("ipRoomsFull"), { code: "ip_rooms_full" });
  if (made.limited) throw new GameHttpError(429, say("roomsFull"), { code: "rooms_full" });
  return made;
}
