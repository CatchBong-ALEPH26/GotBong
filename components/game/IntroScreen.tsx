"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 초상 */
import { useState } from "react";
import type { GameView } from "@/lib/view/types";

/** 사건 소개 화면 (규칙 v2 2장 1단계): 개요, 용의자 4명, 규칙 요약. 진상·범인은 공개하지 않는다. */
export function IntroScreen({ view, onStart }: { view: GameView; onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const sc = view.scenario;
  return (
    <div className="intro">
      <div className="intro-card px">
        <span className="px-tag">사건 파일</span>
        <h1 className="intro-title">{sc.title}</h1>
        <p className="intro-sub">사라진 실습 프로그램</p>
        <p className="intro-text">{sc.intro}</p>
        <h2 className="intro-h">용의자</h2>
        <ul className="intro-people">
          {sc.suspects.map((s) => (
            <li key={s.id}>
              <img src={s.portraits.neutral} alt="" />
              <div>
                <b>{s.name}</b>
                {s.isVictim && <span className="px-chip chip-victim">피해자</span>}
                <p>{s.role}</p>
                <small>{s.keyboard === "wired" ? "유선 키보드" : "무선 키보드"}</small>
              </div>
            </li>
          ))}
        </ul>
        <h2 className="intro-h">규칙</h2>
        <ul className="intro-rules">
          {sc.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="intro-goal">목표: <b>범인 1명</b>과 <b>동기 1개</b>를 맞힌다.</p>
        <button
          className="px-btn on block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onStart();
          }}
        >
          {busy ? "교실로 들어가는 중…" : "수사 시작 · 20분"}
        </button>
      </div>
    </div>
  );
}

/** 도입 "유령 연출": 아무도 없는 윤찬의 화면에서 커서가 저절로 움직이고 창이 닫힌다. 규칙과 무관, 건너뛸 수 있다. */
export function GhostCutscene({ onDone }: { onDone: () => void }) {
  return (
    <div className="ghost" onClick={onDone} role="dialog" aria-label="도입 연출">
      <div className="pc-screen ghost-screen" onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}>
        <section className="win ghost-win">
          <header>점심 룰렛</header>
          <div className="roulette" aria-hidden="true" />
        </section>
        <span className="ghost-cursor" aria-hidden="true" />
        <div className="taskbar"><span className="start">■</span><span className="clock">09:54</span></div>
      </div>
      <p className="ghost-caption">쉬는 시간, 아무도 없는 자리에서…</p>
      <button className="px-btn small ghost-skip" onClick={onDone}>건너뛰기</button>
    </div>
  );
}
