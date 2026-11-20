"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 클로즈업 그림 */
import type { Closeup as CloseupData, GameView, Hotspot } from "@/lib/view/types";
import { PixelIcon } from "@/components/pixel/PixelIcon";

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

/** 피해자의 바탕화면: 실습 폴더, 휴지통, 최근 파일, 메신저를 눌러 본다. 창 속 글은 서버가 준 단서 카드 문장이다. */
function Desktop({ found, onSpot }: { found: (id: string) => { text: string } | undefined; onSpot: (h: Hotspot) => void }) {
  const spot = (id: string, label: string): Hotspot => ({ id, label, x: 0, y: 0, w: 0, h: 0 });
  const trash = found("trash");
  const recent = found("source");
  const chat = found("chat");
  const icons: [string, string, string][] = [
    ["desk-folder", "실습_데모", "/game/items/gk-1.png"],
    ["desk-trash", "휴지통", "/game/items/gk-2.png"],
    ["desk-recent", "최근 파일", "/game/items/gk-7.png"],
    ["desk-chat", "메신저", "/game/items/gk-8.png"],
  ];
  return (
    <div className="pc-screen desktop">
      <div className="desk-icons">
        {icons.map(([id, label, src]) => (
          <button key={id} className="desk-icon" onClick={() => onSpot(spot(id, label))}>
            <img src={src} alt="" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="desk-windows">
        {trash && (
          <section className="win">
            <header>휴지통</header>
            <p className="win-text">{trash.text}</p>
          </section>
        )}
        {recent && (
          <section className="win">
            <header>최근 파일</header>
            <p className="win-text">{recent.text}</p>
          </section>
        )}
        {chat && (
          <section className="win chat-win">
            <header>단체 대화방</header>
            {chat.text.split("\n").map((t, i) => <p key={i} className="chat-line">{t}</p>)}
          </section>
        )}
      </div>
      <div className="taskbar"><span className="start">■</span><span className="clock">10:15</span></div>
    </div>
  );
}
