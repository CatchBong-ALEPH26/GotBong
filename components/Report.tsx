"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 아이콘 */
import { useState } from "react";
import type { GameView } from "@/lib/view/types";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

const VERDICT = {
  win: { label: "해결", sub: "범인과 동기를 모두 맞혔다" },
  lose: { label: "미해결", sub: "범인이나 동기가 틀렸다" },
} as const;

/** 해결했을 때 쓴 질문 수로 매기는 칭호 (화면 연출, 서버 판정과 무관). */
function rank(used: number, max: number) {
  if (used <= Math.round(max * 0.4)) return "명탐정";
  if (used <= Math.round(max * 0.7)) return "탐정";
  return "견습 탐정";
}

/**
 * 결과 발표와 사건 보고서. 종이 한 장. 진상과 역할 배정은 서버가 제출 뒤에만 준다.
 * 서버는 해결/미해결만 주므로, 범인 맞힘 여부는 공개된 배정과 내 답을 비교해 보여 준다.
 * 인쇄(PDF 저장)용 스타일은 globals.css의 @media print.
 */
export function Report({ view, onNewGame }: { view: GameView; onNewGame: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const r = view.report;
  if (!r) return null;
  const v = VERDICT[r.verdict];
  const evName = (id: string | null) => view.evidence.find((e) => e.id === id)?.name;
  const nameOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)?.name ?? "";
  const culprit = r.cast.find((c) => c.culprit)?.name ?? "";
  // 해결이면 서버가 범인을 맞혔다고 판정한 것이다 (이 브라우저에 내 답이 없어도).
  const culpritOk = r.verdict === "win" || (!!r.mine.culprit && r.mine.culprit === culprit);
  // 동기: 해결이면 맞음. 미해결인데 범인을 맞혔다면 동기가 틀린 것. 범인이 틀리면 동기는 따로 알 수 없다.
  const motiveMark = r.verdict === "win" ? "ok" : culpritOk ? "no" : null;
  const found = view.clues.filter((c) => c.found).length;
  const timed = view.clues.filter((c) => c.timeLabel).sort((a, b) => a.timeLabel!.localeCompare(b.timeLabel!));

  return (
    <main className="screen report-screen">
      <SceneBackdrop />
      <article className="paper report">
        <header className="report-head">
          <p className="pencil small">사건 보고서 · {view.scenario.title} · 피해자 {view.scenario.victim}</p>
          <p className={`verdict verdict-${r.verdict}`}>
            <span className="verdict-stamp">{v.label}</span>
          </p>
          <p className="pencil">{v.sub}</p>
          {r.verdict === "win" && (
            <p className="rank">
              칭호 · <b>{rank(r.usage.questionsUsed, view.config.generalQuestions)}</b> <span className="pencil small">(질문 {r.usage.questionsUsed}번 만에 해결)</span>
            </p>
          )}
        </header>

        <section className="answer-grid">
          <div>
            <p className="pencil small">내가 지목한 범인</p>
            <p className="ink">
              <b>{r.mine.culprit || (r.verdict === "win" ? culprit : "—")}</b>
              <span className={`mark ${culpritOk ? "ok" : "no"}`}>{culpritOk ? "○ 맞음" : "× 틀림"}</span>
            </p>
            {!culpritOk && culprit && <p className="pencil small">진짜 범인 · {culprit}</p>}
          </div>
          <div>
            <p className="pencil small">내가 쓴 동기</p>
            <p className="ink">
              {r.mine.motive ? `“${r.mine.motive}”` : "—"}
              {motiveMark && <span className={`mark ${motiveMark}`}>{motiveMark === "ok" ? "○ 맞음" : "× 틀림"}</span>}
            </p>
            {!motiveMark && <p className="pencil small">범인이 달라서 동기는 따로 채점하지 않았다.</p>}
          </div>
        </section>

        <section>
          <h2 className="hand-title small">진상</h2>
          <p className="ink pre">{r.truth}</p>
        </section>

        <section className="report-cols">
          <div>
            <h2 className="hand-title small">현장 단서 {found}/{view.clues.length}</h2>
            <ul className="clue-check">
              {view.clues.map((c) => (
                <li key={c.id} className={c.found ? "got" : "missed"}>
                  <img src={c.icon} alt="" />
                  <span>{c.title}</span>
                  <b aria-label={c.found ? "찾음" : "못 찾음"}>{c.found ? "○" : "×"}</b>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="hand-title small">컴퓨터 기록 시간표</h2>
            <ol className="truth-timeline">
              {timed.map((c) => (
                <li key={c.id}>
                  <span>{c.timeLabel}</span>
                  {c.title.replace(` (${c.timeLabel})`, "")}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="report-cols">
          <div>
            <h2 className="hand-title small">그날의 역할</h2>
            <ul className="key-list">
              {r.cast.map((c) => (
                <li key={c.name} className={`got ${c.culprit ? "culprit" : ""}`}>
                  <b>{c.name}</b> · {c.title}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="hand-title small">사용 현황</h2>
            <ul className="pencil-list">
              <li>쓴 질문 {r.usage.questionsUsed} / {view.config.generalQuestions}</li>
              <li>찾은 단서 {found} / {view.clues.length}</li>
              <li>밑줄 친 말 {r.usage.pinned}개</li>
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
              setResetError(null);
              try {
                await onNewGame();
              } catch (e) {
                setResetError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "새 사건 준비 중…" : "새 게임 (범인이 바뀐다)"}
          </button>
          {resetError && <p className="warn" role="alert">{resetError} 새 게임을 시작하지 못했다.</p>}
        </div>
      </article>
    </main>
  );
}
