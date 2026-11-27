"use client";
import { useEffect, useRef, useState } from "react";
import type { GameView } from "@/lib/view/types";
import { play } from "@/lib/audio/sound";
import { CHARS_PER_SEC, ShotArt, storyScenes, type Shot } from "./StoryShots";

/**
 * 시작 영상: 사건 안내 설명(시나리오 1절)을 장면 그림과 함께 한 문단씩 보여 준다. 건너뛸 수 없다.
 * 장면 그림은 StoryShots에 있고, 수첩의 사건 개요 액자도 같은 그림을 쓴다.
 * 문장은 서버의 사건 소개(intro)를 문단(줄) 단위로 그대로 쓰고, 문단 순서에 맞는 장면을 붙인다.
 * 시간은 화면이 보일 때만 흐른다 (다른 탭에 가 있으면 멈춤). 끝나면 규칙 카드와 "수사 시작" 버튼이 나온다.
 */

const OPENING_MS = 2600;
const HOLD_MS = 1800; // 자막이 다 찍힌 뒤 읽을 시간
/** 장면 속 움직임(커서 클릭, 파일이 잠기는 순서, 사람 등장)이 끝까지 보이는 데 필요한 최소 시간. */
const MIN_MS: Partial<Record<Shot, number>> = { click: 5200, encrypt: 8200, lunch: 6800 };
const sceneMs = (text: string, shot: Shot) => Math.max(MIN_MS[shot] ?? 3400, (text.length / CHARS_PER_SEC) * 1000 + HOLD_MS);

export function IntroScreen({ view, onStart }: { view: GameView; onStart: () => void }) {
  const { scenes: story, notice } = storyScenes(view);
  const scenes: { shot: Shot; text: string; ms: number }[] = [
    { shot: "title", text: "", ms: OPENING_MS },
    ...story.map((s) => ({ ...s, ms: sceneMs(s.text, s.shot) })),
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
