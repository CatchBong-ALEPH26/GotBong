"use client";
import { useState } from "react";
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
          {/* 오류 문장은 서버가 준 탐정 속마음(방 가득참 등)이므로 안내로 보여 준다 */}
          <span className="px-tag">{error ? "탐정" : "불러오는 중"}</span>
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
  if (view.closed) return <ClosedRoom message={view.closed} onNewGame={actions.reset} />;
  return <GameScreen view={view} actions={actions} />;
}

/** 차단(휴면 만료·관리자)된 방: 이어하기 없이 새 수사만 시작할 수 있다. */
function ClosedRoom({ message, onNewGame }: { message: string; onNewGame: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="screen center">
      <SceneBackdrop />
      <div className="px window lobby" role="status">
        <span className="px-tag">탐정</span>
        <p className="say">{message}</p>
        {error && <p className="warn" role="alert">{error}</p>}
        <button
          className="px-btn on block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onNewGame();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          새 수사 시작
        </button>
      </div>
    </main>
  );
}
