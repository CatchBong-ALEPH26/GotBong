"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 그림 */
import type { GameView } from "@/lib/view/types";
import { CHROME_ICON, RANSOM_NOTE } from "@/lib/scene/classroom";
import { LOCKED_EXT, LOCKED_FILES } from "./Closeup";

/**
 * 시작 영상의 장면 그림. 영상(IntroScreen)과 수첩의 사건 개요 액자(StoryFrames)가 함께 쓴다.
 * 용의자가 게임마다 바뀌므로 동영상 파일 대신 화면 요소로 그린다.
 */

/** 줄 순서별 장면. 사건 소개 줄이 더 많으면 나머지는 교실 장면으로 보여 준다. */
const SHOTS = ["click", "encrypt", "lunch", "ask"] as const;
export type Shot = (typeof SHOTS)[number] | "title" | "room";

export const CHARS_PER_SEC = 22.5; // 자막이 찍히는 속도 (처음 15에서 1.5배로 올림)

/** 서버 사건 소개(intro)를 문단(줄) 단위로 나눠 장면을 붙인다. ※ 줄은 이야기가 아니라 따로 돌려준다. */
export function storyScenes(view: GameView): { scenes: { shot: Shot; text: string }[]; notice: string[] } {
  const lines = view.scenario.intro.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    notice: lines.filter((l) => l.startsWith("※")),
    scenes: lines.filter((l) => !l.startsWith("※")).map((text, i) => ({ shot: SHOTS[i] ?? "room", text })),
  };
}

/** 영상 속 강사님 바탕화면. locked 면 파일이 차례로 잠기고 안내문이 뜬다. */
function MovieDesktop({ locked, clock }: { locked: boolean; clock: string }) {
  return (
    <div className="shot-pc">
      <div className={`pc-screen mv-desk ${locked ? "is-locking" : "is-clicking"}`}>
        {locked && <img className="mv-ransom" src={RANSOM_NOTE} alt="" />}
        <div className="mv-icons" aria-hidden="true">
          <div className="mv-icon mv-chrome">
            <img src={CHROME_ICON} alt="" />
            <span>Chrome</span>
          </div>
          {LOCKED_FILES.map((f, i) => (
            <div key={f} className="mv-icon" style={{ "--i": i } as React.CSSProperties}>
              <span className={`mv-doc mv-doc-${i % 4}`} />
              <span>{f}<i>{LOCKED_EXT}</i></span>
            </div>
          ))}
        </div>
        <span className="ghost-cursor mv-cursor" aria-hidden="true" />
        <div className="taskbar"><span className="start">■</span><span className="clock">{clock}</span></div>
      </div>
    </div>
  );
}

export function ShotArt({ shot, view }: { shot: Shot; view: GameView }) {
  const sc = view.scenario;
  switch (shot) {
    case "title":
      return (
        <div className="shot-title">
          <span className="px-tag">사건 파일</span>
          <h1>{sc.title}</h1>
          <p>피해자 · {sc.victim}</p>
        </div>
      );
    case "click":
      // 오후 2시, 강사님이 늘 하던 대로 크롬 아이콘을 누른다.
      return <MovieDesktop locked={false} clock="14:00" />;
    case "encrypt":
      // 화면이 깜빡이고 파일 이름 뒤에 낯선 글자가 붙는다. 아이콘이 흰 문서로 바뀌고, 배경 화면이 안내문 그림으로 바뀐다.
      return <MovieDesktop locked clock="14:05" />;
    case "lunch":
      // 점심시간 내내 빈 자리, 그리고 그날 학원에 있던 네 사람.
      return (
        <div className="shot-room is-dim">
          <img src={sc.scenes[0].background} alt="" />
          <span className="shot-stamp">점심시간 1시 ~ 2시</span>
          <div className="shot-people">
            {sc.suspects.map((s, i) => (
              <figure key={s.id} style={{ animationDelay: `${3600 + i * 500}ms` }}>
                <img src={s.sprites.neutral} alt="" />
                <figcaption>{s.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      );
    case "ask":
      return (
        <div className="shot-title">
          <h1>누가, 왜?</h1>
          <p>질문 {view.config.generalQuestions}번 · 현장 조사는 횟수에 들지 않는다</p>
        </div>
      );
    default:
      return (
        <div className="shot-room">
          <img src={sc.scenes[0].background} alt="" />
        </div>
      );
  }
}
