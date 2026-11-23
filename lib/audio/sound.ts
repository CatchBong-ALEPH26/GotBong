"use client";

// 효과음과 배경음. 파일 없이 Web Audio로 8비트 소리를 만든다.
// 처음엔 꺼져 있고, 켜면 이 브라우저에 기억한다. 팀이 음원 파일을 주면 play()·startBgm() 안만 바꾸면 된다.
import { useSyncExternalStore } from "react";

export type Sfx = "blip" | "tick" | "open" | "found" | "notice" | "fluster" | "send" | "stamp" | "win" | "lose";

const KEY = "gotbong:sound";
let enabled = false;
let loaded = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmWanted = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    enabled = localStorage.getItem(KEY) === "on";
  } catch {
    enabled = false;
  }
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

/** 짧은 음 하나. 네모파·세모파로 픽셀 게임 느낌을 낸다. */
function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + start;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = opts.type ?? "square";
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.linearRampToValueAtTime(freq + opts.slide, t + dur);
  const v = opts.vol ?? 0.08;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const N = (semi: number) => 440 * 2 ** (semi / 12); // A4 기준 반음

export function play(s: Sfx) {
  load();
  if (!enabled) return;
  switch (s) {
    case "blip": // 타자 소리 (대사가 찍힐 때)
      return tone(N(3 + Math.floor(Math.random() * 3)), 0, 0.035, { vol: 0.035 });
    case "tick": // 아무것도 없는 곳
      return tone(N(-5), 0, 0.05, { type: "triangle", vol: 0.08 });
    case "open": // 클로즈업·수첩 열기
      tone(N(-2), 0, 0.06, { type: "triangle", vol: 0.08 });
      return tone(N(5), 0.05, 0.08, { type: "triangle", vol: 0.08 });
    case "found": // 새 단서
      [0, 4, 7, 12].forEach((s2, i) => tone(N(3 + s2), i * 0.07, 0.12, { vol: 0.06 }));
      return;
    case "notice": // 다시 물어야 함
      tone(N(-10), 0, 0.12, { vol: 0.05 });
      return tone(N(-13), 0.1, 0.16, { vol: 0.05 });
    case "fluster": // 당황
      return tone(N(10), 0, 0.22, { vol: 0.05, slide: -400 });
    case "send": // 질문 보냄
      return tone(N(0), 0, 0.06, { vol: 0.05, slide: 200 });
    case "stamp": // 제출 도장
      tone(N(-24), 0, 0.18, { type: "triangle", vol: 0.25 });
      return tone(N(-17), 0.02, 0.1, { vol: 0.05 });
    case "win":
      [0, 4, 7, 12, 7, 12, 16].forEach((s2, i) => tone(N(3 + s2), i * 0.11, i === 6 ? 0.5 : 0.14, { vol: 0.06 }));
      return;
    case "lose":
      [7, 3, 0, -5].forEach((s2, i) => tone(N(s2), i * 0.22, i === 3 ? 0.6 : 0.24, { type: "triangle", vol: 0.12 }));
      return;
  }
}

/** 조용한 배경음: 느린 단조 아르페지오 (8마디 반복). 켜져 있을 때만 돈다. */
const BGM_BARS = [
  [-12, -5, 0, 3],
  [-14, -7, -2, 2],
  [-16, -9, -4, 0],
  [-17, -10, -5, -1],
];
function bgmTick(step: number) {
  // 브라우저가 아직 소리를 막아 둔 상태(클릭 전)면 음표를 예약하지 않는다.
  // 멈춘 시계에 쌓인 음표가 첫 클릭 때 한꺼번에 터지는 것을 막는다.
  if (!ctx || ctx.state !== "running") {
    if (ctx?.state === "suspended") void ctx.resume();
    return;
  }
  const bar = BGM_BARS[Math.floor(step / 8) % BGM_BARS.length];
  const i = step % 8;
  const note = bar[[0, 1, 2, 3, 2, 1, 2, 3][i]];
  tone(N(note), 0, 0.5, { type: "triangle", vol: 0.035 });
  if (i === 0) tone(N(bar[0] - 12), 0, 2.2, { type: "triangle", vol: 0.04 });
}
function syncBgm() {
  const on = enabled && bgmWanted;
  if (on && !bgmTimer) {
    let step = 0;
    bgmTick(step++);
    bgmTimer = setInterval(() => bgmTick(step++), 380);
  } else if (!on && bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

/** 게임 화면에 들어가면 true, 나가면 false. */
export function setBgm(want: boolean) {
  load();
  bgmWanted = want;
  syncBgm();
}

export function setSound(on: boolean) {
  load();
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 저장이 막혀 있으면 이번 화면에서만 */
  }
  if (on) {
    audio();
    play("open");
  }
  syncBgm();
  listeners.forEach((l) => l());
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (load(), enabled),
    () => false,
  );
}
