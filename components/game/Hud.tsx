"use client";
import type { GameView } from "@/lib/view/types";
import { questionsLeft } from "@/lib/view/rules";
import { PixelIcon } from "@/components/pixel/PixelIcon";

/** 화면 위 작은 표시들: 수첩, 장소, 남은 질문. 서버가 테스트 모드(고정 응답)면 알려 준다. */
export function Hud({ view, sceneId, onMove, onNotebook }: { view: GameView; sceneId: string; onMove: (id: string) => void; onNotebook: () => void }) {
  const scenes = view.scenario.scenes;
  const here = scenes.find((s) => s.id === sceneId)!;
  const others = scenes.filter((s) => s.id !== sceneId);
  const qLeft = questionsLeft(view);
  return (
    <div className="hud">
      <button className="px-btn hud-note" onClick={onNotebook} aria-label={`수첩 열기, 단서 ${view.evidence.length}개`}>
        <PixelIcon name="note" />
        <span>수첩</span>
        {view.evidence.length > 0 && <span className="hud-badge">{view.evidence.length}</span>}
      </button>
      <div className="hud-place" role="group" aria-label="장소">
        <span className="px-tag place-now">{here.name}</span>
        {others.map((s) => (
          <button key={s.id} className="px-btn small place-go" onClick={() => onMove(s.id)} aria-label={`${s.name}로 이동`}>
            {s.name}로 <PixelIcon name="right" size={12} />
          </button>
        ))}
      </div>
      <div className="hud-right">
        {view.mode === "fixture" && (
          <span className="px-chip chip-warn" title="AI 키가 없어 고정 응답으로 동작 중">테스트 모드</span>
        )}
        <span className={`px-chip ${qLeft <= 5 ? "chip-warn" : ""}`} aria-label={`남은 질문 ${qLeft}개`}>
          남은 질문 {qLeft}
        </span>
      </div>
    </div>
  );
}
