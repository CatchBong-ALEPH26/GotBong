"use client";
import type { GameView } from "@/lib/view/types";
import { questionsLeft } from "@/lib/view/rules";
import { formatMs } from "@/lib/view/useNow";
import { PixelIcon } from "@/components/pixel/PixelIcon";

/** 화면 위 작은 표시들: 수첩, 장소, 남은 시간, 남은 질문, 같은 방 탐정 진행. */
export function Hud({ view, now, sceneId, onMove, onNotebook }: { view: GameView; now: number; sceneId: string; onMove: (id: string) => void; onNotebook: () => void }) {
  const scenes = view.scenario.scenes;
  const here = scenes.find((s) => s.id === sceneId)!;
  const others = scenes.filter((s) => s.id !== sceneId);
  const left = view.endsAt ? Math.max(0, view.endsAt - now) : view.config.totalMs;
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
        <span className={`px-chip ${left <= 60_000 ? "chip-warn" : ""}`} aria-label={`남은 시간 ${formatMs(left)}`}>
          <PixelIcon name="clock" size={14} /> {formatMs(left)}
        </span>
        <span className={`px-chip ${qLeft <= 5 ? "chip-warn" : ""}`} aria-label={`남은 질문 ${qLeft}개`}>
          남은 질문 {qLeft}
        </span>
        <details className="hud-players">
          <summary className="px-chip" aria-label="탐정 진행 보기">
            <PixelIcon name="people" size={14} /> {view.players.filter((p) => p.submitted).length}/{view.players.length}
          </summary>
          <div className="px players-pop">
            <p className="pop-me">같은 방 탐정 · 제출 여부</p>
            <ul>
              {view.players.map((p) => (
                <li key={p.nickname}>
                  <span>{p.nickname}{p.isMe && " (나)"}</span>
                  <span>{p.questionsUsed}회</span>
                  <span className={p.submitted ? "done" : ""}>{p.submitted ? "제출" : "조사 중"}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
}
