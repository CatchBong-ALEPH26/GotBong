"use client";
import Link from "next/link";
import type { GameView, Verdict } from "@/lib/view/types";
import { formatMs } from "@/lib/view/useNow";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

const VERDICT: Record<Verdict, { label: string; sub: string }> = {
  win: { label: "승리", sub: "범인과 동기를 모두 맞혔다" },
  partial: { label: "부분 성공", sub: "범인은 맞혔지만 동기는 틀렸다" },
  lose: { label: "패배", sub: "범인을 맞히지 못했다" },
};

/** 결과 발표와 추리 보고서 (규칙 v2 8장). 종이 한 장. 인쇄(PDF 저장)용 스타일은 globals.css의 @media print. */
export function Report({ view }: { view: GameView }) {
  const r = view.report;
  if (!r) return <main className="screen center"><p className="say">결과를 불러오는 중…</p></main>;
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
          <p className="pencil">{r.mine.culprit ? v.sub : "시간 안에 제출하지 못했다"}</p>
        </header>

        <section className="answer-grid">
          <div>
            <p className="pencil small">범인</p>
            <p className="ink"><b>{r.answer.culprit}</b> {r.culpritOk ? <span className="mark ok">맞힘</span> : <span className="mark no">내 답: {r.mine.culprit ?? "없음"}</span>}</p>
          </div>
          <div>
            <p className="pencil small">동기</p>
            <p className="ink"><b>{r.answer.motive}</b> {r.motiveOk ? <span className="mark ok">맞힘</span> : <span className="mark no">내 답: {r.mine.motive ?? "없음"}</span>}</p>
          </div>
        </section>

        <section>
          <h2 className="hand-title small">진상</h2>
          <p className="ink">{r.truth}</p>
          <p className="ink"><b>경위</b> {r.howItHappened}</p>
          <ol className="truth-timeline">
            {r.timeline.map((t) => (
              <li key={t.time + t.text}><span>{t.time}</span>{t.text}</li>
            ))}
          </ol>
        </section>

        <section className="report-cols">
          <div>
            <h2 className="hand-title small">핵심 증거</h2>
            <ul className="key-list">
              {r.keyEvidence.map((k) => (
                <li key={k.label} className={k.got ? "got" : ""}>{k.got ? "○" : "×"} {k.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="hand-title small">사용 현황</h2>
            <ul className="pencil-list">
              <li>쓴 질문 {r.usage.questionsUsed} / {view.config.generalQuestions}</li>
              <li>남은 시간 {formatMs(r.usage.timeLeftMs)}</li>
              <li>모은 단서·증언 {r.usage.evidenceFound}개</li>
              <li>내민 증거 {r.usage.evidenceShown.length ? r.usage.evidenceShown.join(", ") : "없음"}</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="hand-title small">같은 방 탐정</h2>
          <table className="rank">
            <thead>
              <tr><th>탐정</th><th>결과</th><th>쓴 질문</th></tr>
            </thead>
            <tbody>
              {r.players.map((p) => (
                <tr key={p.nickname}>
                  <td>{p.nickname}{p.isMe && " (나)"}</td>
                  <td>{p.verdict ? VERDICT[p.verdict].label : "미제출"}</td>
                  <td>{p.questionsUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    {nameOf(m.suspectId)} · Q. {m.question || "(증거만 내밀었다)"}
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
          <Link className="paper-btn red" href="/">새 게임</Link>
        </div>
      </article>
    </main>
  );
}
