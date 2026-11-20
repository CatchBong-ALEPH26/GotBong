"use client";
import { useState } from "react";
import type { GameView } from "@/lib/view/types";
import type { GameActions } from "@/lib/mock/useMockGame";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

export function Waiting({ view, actions }: { view: GameView; actions: GameActions }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const slots = Array.from({ length: 4 }, (_, i) => view.players[i]);

  return (
    <main className="screen center">
      <SceneBackdrop />
      <div className="px window waiting">
        <span className="px-tag">대기실</span>
        <div className="room-code">
          <span className="label">방 코드</span>
          <strong>{view.code}</strong>
          <button
            className="px-btn small"
            onClick={async () => {
              await navigator.clipboard?.writeText(location.href).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? "링크 복사됨" : "초대 링크 복사"}
          </button>
        </div>
        <ul className="seats">
          {slots.map((p, i) => (
            <li key={i} className={p ? "seat filled" : "seat"}>
              {p ? (
                <>
                  <span>{p.nickname}{p.isMe && " (나)"}</span>
                  {i === 0 && <span className="px-chip">방장</span>}
                </>
              ) : (
                <span className="dim">빈 자리</span>
              )}
            </li>
          ))}
        </ul>
        <div className="brief">
          <p className="label">오늘의 사건 · {view.scenario.title}</p>
          <p>쉬는 시간에 켜 둔 실습 프로그램이 사라졌다. 자세한 내용은 수사를 시작하면 공개된다.</p>
          <ul>
            <li>각자 혼자 사건을 푼다. 문답과 수첩은 나만 본다</li>
            <li>제한 시간 20분, 질문 20개</li>
            <li>범인 1명과 동기 1개를 맞히면 승리</li>
          </ul>
        </div>
        {view.me.isHost ? (
          <button
            className="px-btn on block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await actions.start();
            }}
          >
            {busy ? "시작하는 중…" : "수사 시작"}
          </button>
        ) : (
          <p className="dim center-text">방장이 시작하기를 기다리는 중…</p>
        )}
      </div>
    </main>
  );
}
