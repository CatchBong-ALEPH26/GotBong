"use client";
import { useGame } from "@/lib/api/useGame";
import { GameScreen } from "@/components/game/GameScreen";
import { Report } from "@/components/Report";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

/** 게임 화면: 서버의 현재 게임을 불러와 진행 / 보고서를 고른다. 게임은 브라우저 쿠키로 이어진다(새로고침해도 유지). */
export default function PlayPage() {
  const { view, error, retry, actions } = useGame();

  if (!view)
    return (
      <main className="screen center">
        <SceneBackdrop />
        <div className="px window lobby" role={error ? "alert" : "status"}>
          <span className="px-tag">{error ? "연결 실패" : "불러오는 중"}</span>
          <p className="say">{error ?? "사건 파일을 펼치는 중…"}</p>
          {error && (
            <button className="px-btn on block" onClick={retry}>
              다시 시도
            </button>
          )}
        </div>
      </main>
    );

  if (view.report) return <Report view={view} onNewGame={actions.reset} />;
  return <GameScreen view={view} actions={actions} />;
}
