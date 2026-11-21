// 화면 표시용 계산. 실제 판정은 서버가 한다.
import type { GameView } from "./types";

export function questionsLeft(v: GameView) {
  return Math.max(0, v.config.generalQuestions - v.me.questionsUsed);
}
