"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 그림 */
import { useEffect, useRef, useState } from "react";
import type { GameView } from "@/lib/view/types";
import { play } from "@/lib/audio/sound";

/**
 * 도입 영상: 사건 개요를 장면 그림과 함께 한 줄씩 보여 준다. 건너뛸 수 없다.
 * 피해자와 용의자 이름이 게임마다 바뀌므로 동영상 파일 대신 화면 요소로 그린다.
 * 문장은 서버의 사건 소개(intro)를 줄 단위로 그대로 쓰고, 줄 순서에 맞는 장면을 붙인다.
 * 시간은 화면이 보일 때만 흐른다 (다른 탭에 가 있으면 멈춤). 끝나면 규칙 카드와 "수사 시작" 버튼이 나온다.
 */

/** 줄 순서별 장면. 사건 소개 줄이 더 많으면 나머지는 교실 장면으로 보여 준다. */
const SHOTS = ["present", "vanish", "away", "people", "usb", "question"] as const;
type Shot = (typeof SHOTS)[number] | "title" | "room";

const OPENING_MS = 2600;
const CHARS_PER_SEC = 15; // 자막이 찍히는 속도
const HOLD_MS = 1800; // 자막이 다 찍힌 뒤 읽을 시간
const sceneMs = (text: string) => Math.max(3400, (text.length / CHARS_PER_SEC) * 1000 + HOLD_MS);

export function IntroScreen({ view, onStart }: { view: GameView; onStart: () => void }) {
  const sc = view.scenario;
  const lines = sc.intro.split("\n").map((l) => l.trim()).filter(Boolean);
  const notice = lines.filter((l) => l.startsWith("※"));
  const story = lines.filter((l) => !l.startsWith("※"));
  const scenes: { shot: Shot; text: string; ms: number }[] = [
    { shot: "title", text: "", ms: OPENING_MS },
    ...story.map((text, i) => ({ shot: SHOTS[i] ?? ("room" as const), text, ms: sceneMs(text) })),
  ];
  const total = scenes.reduce((n, s) => n + s.ms, 0);

  // 화면이 보일 때만 시간이 흐르도록 requestAnimationFrame으로 잰다.
  const [elapsed, setElapsed] = useState(0);
  const done = elapsed >= total;
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (done) return;
    let raf = 0;
    const step = (t: number) => {
      const dt = last.current === null ? 0 : Math.min(t - last.current, 100);
      last.current = t;
      setElapsed((e) => Math.min(total, e + dt));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [done, total]);

  // 지금 몇 번째 장면이고, 그 장면에서 얼마나 지났는지.
  let idx = 0;
  let at = elapsed;
  while (idx < scenes.length - 1 && at >= scenes[idx].ms) {
    at -= scenes[idx].ms;
    idx++;
  }
  const scene = scenes[idx];
  const shown = Math.floor((at / 1000) * CHARS_PER_SEC);
  const caption = scene.text.slice(0, shown);

  // 장면이 바뀔 때 짧은 소리, 자막이 찍히는 동안 타자 소리.
  useEffect(() => {
    if (!done) play(idx === 0 ? "open" : "tick");
  }, [idx, done]);
  useEffect(() => {
    if (!done && caption.length > 0 && caption.length < scene.text.length && caption.length % 4 === 0) play("blip");
  }, [caption.length, scene.text.length, done]);

  if (done) return <Briefing view={view} notice={notice} onStart={onStart} />;

  return (
    <div className="movie" role="dialog" aria-label="사건 개요 영상">
      <div className="movie-frame">
        <div className="movie-shot" key={idx}>
          <ShotArt shot={scene.shot} view={view} />
        </div>
        {scene.text && (
          <p className="movie-caption" aria-live="polite">
            <span aria-hidden="true">{caption}</span>
            <span className="sr-only">{scene.text}</span>
          </p>
        )}
        <div className="movie-bar" role="progressbar" aria-label="영상 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((elapsed / total) * 100)}>
          <span style={{ width: `${(elapsed / total) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function ShotArt({ shot, view }: { shot: Shot; view: GameView }) {
  const sc = view.scenario;
  switch (shot) {
    case "title":
      return (
        <div className="shot-title">
          <span className="px-tag">사건 파일</span>
          <h1>{sc.title}</h1>
          <p>사라진 실습 프로그램</p>
        </div>
      );
    case "present":
      // 발표 직전: 피해자 화면에 점심 룰렛이 돌고 있다.
      return (
        <div className="shot-pc">
          <div className="pc-screen">
            <section className="win shot-win">
              <header>점심 룰렛</header>
              <div className="roulette" aria-hidden="true" />
            </section>
            <div className="taskbar"><span className="start">■</span><span className="clock">10:15</span></div>
          </div>
        </div>
      );
    case "vanish":
      // 아무도 없는 자리에서 커서가 저절로 움직이고 창이 닫힌다.
      return (
        <div className="shot-pc">
          <div className="pc-screen">
            <div className="shot-exe" aria-hidden="true"><span />점심룰렛_데모.exe</div>
            <section className="win shot-win is-closing">
              <header>점심 룰렛</header>
              <div className="roulette" aria-hidden="true" />
            </section>
            <span className="ghost-cursor" aria-hidden="true" />
            <div className="taskbar"><span className="start">■</span><span className="clock">09:56</span></div>
          </div>
        </div>
      );
    case "away":
      return (
        <div className="shot-room is-dim">
          <img src={sc.scenes[0].background} alt="" />
          <span className="shot-stamp">쉬는 시간</span>
        </div>
      );
    case "people":
      return (
        <div className="shot-people">
          {sc.suspects.map((s, i) => (
            <figure key={s.id} style={{ animationDelay: `${300 + i * 450}ms` }}>
              <img src={s.sprites.neutral} alt="" />
              <figcaption>{s.name}</figcaption>
            </figure>
          ))}
        </div>
      );
    case "usb":
      return (
        <div className="shot-room is-zoom">
          <img src={sc.closeups["tower-back"]?.kind === "image" ? sc.closeups["tower-back"].background : sc.scenes[0].background} alt="" />
        </div>
      );
    case "question":
      return (
        <div className="shot-title">
          <h1>누가, 왜?</h1>
          <p>피해자 · {sc.victim}</p>
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

/** 영상이 끝난 뒤의 규칙 카드. 사건 개요는 수첩에서 다시 볼 수 있다. */
function Briefing({ view, notice, onStart }: { view: GameView; notice: string[]; onStart: () => void }) {
  const sc = view.scenario;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  return (
    <div className="intro">
      <div className="intro-card px">
        <span className="px-tag">수사 규칙</span>
        <h1 className="intro-title">{sc.title}</h1>
        <p className="intro-victim">피해자 · <b>{sc.victim}</b> &nbsp; 용의자 · <b>{sc.suspects.map((s) => s.name).join(", ")}</b></p>
        <ul className="intro-rules">
          {sc.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="intro-goal">목표: <b>범인 1명</b>과 <b>동기</b>를 맞힌다. 사건 개요는 수첩에서 다시 볼 수 있다.</p>
        {notice.map((n) => (
          <p key={n} className="intro-notice">{n}</p>
        ))}
        <button ref={btn} className="px-btn on block" onClick={onStart}>
          수사 시작
        </button>
      </div>
    </div>
  );
}
