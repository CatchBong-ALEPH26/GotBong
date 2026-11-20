// 화면 표시용 계산. 실제 판정은 서버가 한다.
import type { GameView } from "./types";

export function questionsLeft(v: GameView) {
  return Math.max(0, v.config.generalQuestions - v.me.questionsUsed);
}

/** 키보드 테스트가 열렸는지 (규칙 v2: 단서 3·4 확보 후). */
export function keyboardTestOpen(v: GameView) {
  const have = new Set(v.evidence.map((e) => e.id));
  return v.scenario.keyboardTest.requires.every((id) => have.has(id));
}

export function suspectName(v: GameView, id: string | null | undefined) {
  return v.scenario.suspects.find((s) => s.id === id)?.name ?? "";
}
