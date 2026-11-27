"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameView } from "@/lib/view/types";
import { play } from "@/lib/audio/sound";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { CHARS_PER_SEC, ShotArt, storyScenes, type Shot } from "./StoryShots";

type Scene = { shot: Shot; text: string };

/** 액자 속 장면은 영상 크기(1280×720)로 그린 뒤 액자 너비에 맞게 줄인다. 글자 크기·cqi 단위가 영상과 같아진다. */
const STAGE_W = 1280;

/**
 * 수첩의 사건 개요: 시작 영상의 장면을 액자처럼 걸어 둔다. 글 대신 장면을 눌러 그 장면과 자막을 다시 본다.
 * 액자 속 그림은 장면의 마지막 모습(움직임이 끝난 상태)으로 멈춰 있다.
 */
export function StoryFrames({ view }: { view: GameView }) {
  const { scenes } = storyScenes(view);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <p className="pencil small">시작 영상의 장면. 누르면 다시 볼 수 있다.</p>
      <ol className="story-frames">
        {scenes.map((s, i) => (
          <li key={i}>
            <button
              className="story-frame"
              aria-label={`장면 ${i + 1} 다시 보기`}
              onClick={() => {
                play("open");
                setOpen(i);
              }}
            >
              <Still shot={s.shot} view={view} />
              <span className="story-no" aria-hidden="true">
                <PixelIcon name="right" size={10} /> {i + 1}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {open !== null && <StoryViewer view={view} scenes={scenes} index={open} setIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * 멈춘 장면 한 장. 작은 액자에서도 알아보게 장면별로 확대해 자른다(globals.css의 data-shot).
 * 수첩 왼쪽 "사건 개요" 카드의 작은 그림으로도 쓴다.
 */
export function Still({ shot, view }: { shot: Shot; view: GameView }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / STAGE_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="story-still" ref={box} aria-hidden="true">
      <div className="story-stage is-still" data-shot={shot} style={{ transform: `scale(${scale})` }}>
        <ShotArt shot={shot} view={view} />
      </div>
    </div>
  );
}

/**
 * 다시 보기 창: 고른 장면을 처음부터 다시 재생하고 자막을 영상과 같은 속도로 찍는다.
 * ←/→로 넘기고 Esc로 닫는다. 키는 먼저 가로채서 수첩이 같이 닫히지 않게 한다 (Modal과 같은 방식).
 */
function StoryViewer(props: { view: GameView; scenes: Scene[]; index: number; setIndex: (i: number) => void; onClose: () => void }) {
  const { view, scenes, index, setIndex, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState(0);
  const go = (i: number) => {
    if (i < 0 || i >= scenes.length) return;
    play("tick");
    setReplay(0);
    setIndex(i);
  };
  // 키 처리기는 열릴 때 한 번만 단다. 최신 값은 ref로 읽는다.
  const latest = useRef({ index, go, onClose });
  useEffect(() => {
    latest.current = { index, go, onClose };
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const { index: i, go: move, onClose: close } = latest.current;
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopPropagation();
        e.preventDefault();
        move(i + (e.key === "ArrowLeft" ? -1 : 1));
      } else if (e.key === "Tab" && ref.current) {
        // Tab이 창 밖(뒤쪽 수첩)으로 나가지 않게 가둔다.
        const items = ref.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus();
    };
  }, []);

  const scene = scenes[index];
  return createPortal(
    <div className="story-viewer" onClick={onClose}>
      <div className="story-viewer-box" role="dialog" aria-modal="true" aria-label={`사건 개요 · 장면 ${index + 1}`} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <Replay key={`${index}-${replay}`} scene={scene} view={view} onReplay={() => setReplay((n) => n + 1)} />
        <div className="story-controls">
          <button className="px-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="앞 장면">
            <PixelIcon name="left" size={16} /> 이전
          </button>
          <span className="story-count">{index + 1} / {scenes.length}</span>
          <button className="px-btn" onClick={() => go(index + 1)} disabled={index === scenes.length - 1} aria-label="다음 장면">
            다음 <PixelIcon name="right" size={16} />
          </button>
          <button className="px-btn story-again" onClick={() => setReplay((n) => n + 1)}>
            <PixelIcon name="replay" size={16} /> 이 장면 다시
          </button>
        </div>
        <button className="px-btn icon story-close" onClick={onClose} aria-label="다시 보기 닫기">
          <PixelIcon name="close" size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** 장면 하나를 처음부터 재생한다. 화면을 누르면 자막을 끝까지 보여 주고, 다 보인 뒤 누르면 처음부터 다시. */
function Replay({ scene, view, onReplay }: { scene: Scene; view: GameView; onReplay: () => void }) {
  const [shown, setShown] = useState(0);
  const full = shown >= scene.text.length;
  useEffect(() => {
    if (full) return;
    let raf = 0;
    let t0: number | null = null;
    const step = (t: number) => {
      t0 ??= t;
      setShown(Math.min(scene.text.length, Math.floor(((t - t0) / 1000) * CHARS_PER_SEC)));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [full, scene.text.length]);
  useEffect(() => {
    if (shown > 0 && !full && shown % 4 === 0) play("blip");
  }, [shown, full]);
  return (
    // 마우스 편의: 화면을 누르면 자막 넘기기/다시 재생. 키보드는 아래 "처음부터" 버튼으로 한다.
    <div className="movie-frame story-screen" onClick={() => (full ? onReplay() : setShown(scene.text.length))}>
      <div className="movie-shot">
        <ShotArt shot={scene.shot} view={view} />
      </div>
      {scene.text && (
        <p className="movie-caption" aria-live="polite">
          <span aria-hidden="true">{scene.text.slice(0, shown)}</span>
          <span className="sr-only">{scene.text}</span>
        </p>
      )}
    </div>
  );
}
