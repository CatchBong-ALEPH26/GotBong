"use client";
import { useState } from "react";
import type { GameView } from "@/lib/view/types";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

const VERDICT = {
  win: { label: "해결", sub: "범인과 동기를 모두 맞혔다" },
  lose: { label: "미해결", sub: "범인이나 동기가 틀렸다" },
} as const;

/** 결과 발표와 사건 보고서. 종이 한 장. 진상과 역할 배정은 서버가 제출 뒤에만 준다. 인쇄(PDF 저장)용 스타일은 globals.css의 @media print. */
export function Report({ view, onNewGame }: { view: GameView; onNewGame: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const r = view.report;
  if (!r) return null;
  const v = VERDICT[r.verdict];
  const evName = (id: string | null) => view.evidence.find((e) => e.id === id)?.name;
  const nameOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)?.name ?? "";

  return (
    <main className="screen report-screen">
      <SceneBackdrop />
      <article className="paper report">
        <header className="report-head">
          <p className="pencil small">사건 보고서 · {view.scenario.title}</p>
          <p className={`verdict verdict-${r.verdict}`}>{v.label}</p>
          <p className="pencil">{v.sub}</p>
        </header>

        <section className="answer-grid">
          <div>
            <p className="pencil small">내가 지목한 범인</p>
            <p className="ink"><b>{r.mine.culprit || "—"}</b></p>
          </div>
          <div>
            <p className="pencil small">내가 쓴 동기</p>
            <p className="ink">{r.mine.motive || "—"}</p>
          </div>
        </section>

        <section>
          <h2 className="hand-title small">진상</h2>
          <p className="ink pre">{r.truth}</p>
        </section>

        <section className="report-cols">
          <div>
            <h2 className="hand-title small">그날의 역할</h2>
            <ul className="key-list">
              {r.cast.map((c) => (
                <li key={c.name} className="got"><b>{c.name}</b> · {c.title}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="hand-title small">사용 현황</h2>
            <ul className="pencil-list">
              <li>쓴 질문 {r.usage.questionsUsed} / {view.config.generalQuestions}</li>
              <li>찾은 단서 {r.usage.evidenceFound}개</li>
              <li>내민 증거 {r.usage.evidenceShown.length ? r.usage.evidenceShown.join(", ") : "없음"}</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="hand-title small">대화 기록</h2>
          {view.messages.length === 0 ? (
            <p className="pencil">문답이 없다.</p>
          ) : (
            <ol className="log">
              {view.messages.map((m) => (
                <li key={m.id}>
                  <p className="q">
                    {nameOf(m.suspectId)} · Q. {m.question}
                    {m.clueId && <span className="stamp-mini">증거: {evName(m.clueId)}</span>}
                  </p>
                  <p className="a">A. {m.answer}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="report-actions no-print">
          <button className="paper-btn" onClick={() => window.print()}>인쇄 / PDF 저장</button>
          <button
            className="paper-btn red"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onNewGame().finally(() => setBusy(false));
            }}
          >
            {busy ? "새 사건 준비 중…" : "새 게임 (범인이 바뀐다)"}
          </button>
        </div>
      </article>
    </main>
  );
}
