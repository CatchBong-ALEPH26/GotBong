"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 클로즈업 그림 */
import { useState } from "react";
import type { Closeup as CloseupData, ClueForm, GameView, Hotspot } from "@/lib/view/types";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { CHROME_ICON, RANSOM_NOTE } from "@/lib/scene/classroom";
import { ClueCard } from "./ClueCard";

/**
 * 클로즈업 화면 (2단계 조사). 장면 위에 확대 그림이나 컴퓨터 화면을 띄운다.
 * 결과 글은 아래 대사창에 나온다. 화면 속 글자는 조사해서 얻은 증거 내용만 보여 준다(서버가 준 것).
 */
export function Closeup(props: { view: GameView; data: CloseupData; onSpot: (h: Hotspot) => void; onOpen: (id: string) => void; onClose: () => void }) {
  const { view, data, onSpot, onOpen, onClose } = props;
  const box = (r: { x: number; y: number; w: number; h: number }) => ({ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` });
  const found = (id: string) => view.evidence.find((e) => e.id === id);

  return (
    <div className="closeup" role="dialog" aria-label={data.title}>
      <div className="closeup-bar">
        <span className="px-tag">{data.title}</span>
        <span className="closeup-links">
          {data.kind === "image" &&
            data.links?.map((l) => (
              <button key={l.closeup} className="px-btn small" onClick={() => onOpen(l.closeup)}>
                {l.label} <PixelIcon name="right" size={12} />
              </button>
            ))}
          <button className="px-btn small" onClick={onClose} aria-label="돌아가기">
            <PixelIcon name="close" size={12} /> 돌아가기
          </button>
        </span>
      </div>
      <div className="closeup-body cursor-look">
        {data.kind === "image" ? (
          <>
            <img className="closeup-img" src={data.background} alt={data.title} draggable={false} />
            {data.hotspots.map((h, i) => (
              <button key={`${h.id}-${i}`} className="hit" style={box(h)} aria-label={h.label} onClick={() => onSpot(h)} />
            ))}
          </>
        ) : (
          <Desktop found={found} onSpot={onSpot} />
        )}
      </div>
    </div>
  );
}

/** 피해 입은 파일들 (연출용 이름). 이름 뒤에 낯선 글자가 붙고 아이콘은 흰 빈 문서다. */
export const LOCKED_FILES = ["3주차_강의자료.pptx", "출석부.xlsx", "실습_예제.zip", "포폴_피드백.docx", "강의계획서.hwp"];
export const LOCKED_EXT = ".k9x2";

/**
 * 강사님의 바탕화면 (피해 뒤). 배경 화면이 안내문 그림으로 바뀌어 있다 (안내문 파일이 따로 생기는 게 아니다).
 * 크롬 바로가기와 장치 기록을 누르면 단서 창이 열린다. 창 속 글은 서버가 준 단서 카드 문장이다. 나머지 파일은 열리지 않는다.
 */
function Desktop({ found, onSpot }: { found: (id: string) => { name: string; text: string } | undefined; onSpot: (h: Hotspot) => void }) {
  const [open, setOpen] = useState<"shortcut" | "usblog" | null>(null);
  const spot = (id: string, label: string): Hotspot => ({ id, label, x: 0, y: 0, w: 0, h: 0 });
  const press = (id: string, label: string, win: typeof open) => {
    setOpen(win);
    onSpot(spot(id, label));
  };
  const clue = open ? found(open) : undefined;
  return (
    <div className="pc-screen desktop is-locked" onClick={(e) => !(e.target as HTMLElement).closest("button, .cc, .taskbar") && press("pc-note", "바뀐 배경 화면", null)}>
      <img className="desk-wallpaper" src={RANSOM_NOTE} alt="배경 화면이 누군가 남긴 안내문으로 바뀌어 있다. 파일을 잠갔다는 내용이 영어로 적혀 있다." />
      <div className="desk-icons">
        <button className="desk-icon" onClick={() => press("pc-chrome", "크롬 바로가기", "shortcut")}>
          <img src={CHROME_ICON} alt="" />
          <span>Chrome</span>
        </button>
        <button className="desk-icon" onClick={() => press("pc-devices", "장치 기록", "usblog")}>
          <img src="/game/items/gk-6.png" alt="" />
          <span>장치 기록</span>
        </button>
        {LOCKED_FILES.map((f) => (
          <button key={f} className="desk-icon" onClick={() => press("pc-file", f + LOCKED_EXT, null)}>
            <span className="blank-doc" aria-hidden="true" />
            <span>{f}<i>{LOCKED_EXT}</i></span>
          </button>
        ))}
      </div>
      <div className="desk-windows">
        {clue && <ClueCard form="window" title={clue.name} text={clue.text} size="lg" />}
      </div>
      <div className="taskbar"><span className="start">■</span><span className="clock">14:05</span></div>
    </div>
  );
}

/** 현장에서 찾은 단서를 실제 물건 모양으로 크게 보여 준다 (종이, 실물 등). */
export function ClueView({ title, form, text, onClose }: { title: string; form: ClueForm; text: string; onClose: () => void }) {
  return (
    <div className="closeup clue-view" role="dialog" aria-label={title}>
      <div className="closeup-bar">
        <span className="px-tag">{title}</span>
        <button className="px-btn small" onClick={onClose} aria-label="돌아가기">
          <PixelIcon name="close" size={12} /> 돌아가기
        </button>
      </div>
      <div className={`closeup-body clue-stage clue-stage-${form}`}>
        <ClueCard form={form} title={title} text={text} size="lg" />
      </div>
    </div>
  );
}
