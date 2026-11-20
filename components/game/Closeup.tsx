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
  const ownerName = data.kind === "screen" ? view.scenario.suspects.find((s) => s.id === data.owner)?.name : undefined;

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
        ) : data.screen === "desktop" ? (
          <Desktop found={found} onSpot={onSpot} owner={ownerName ?? ""} />
        ) : (
          <Editor found={found} onSpot={onSpot} />
        )}
      </div>
    </div>
  );
}

/** 윤찬의 바탕화면: 실습 폴더, 휴지통, 메신저를 눌러 본다. */
function Desktop({ found, onSpot }: { found: (id: string) => { text: string } | undefined; onSpot: (h: Hotspot) => void; owner: string }) {
  const spot = (id: string, label: string): Hotspot => ({ id, label, x: 0, y: 0, w: 0, h: 0 });
  const folder = found("c1");
  const trash = found("c2");
  const chat = found("c8");
  return (
    <div className="pc-screen desktop">
      <div className="desk-icons">
        <button className="desk-icon" onClick={() => onSpot(spot("b-folder", "실습_데모 폴더"))}>
          <img src="/game/items/gk-1.png" alt="" />
          <span>실습_데모</span>
        </button>
        <button className="desk-icon" onClick={() => onSpot(spot("b-trash", "휴지통"))}>
          <img src="/game/items/gk-2.png" alt="" />
          <span>휴지통</span>
        </button>
        <button className="desk-icon" onClick={() => onSpot(spot("b-chat", "메신저"))}>
          <img src="/game/items/gk-8.png" alt="" />
          <span>메신저</span>
        </button>
      </div>
      <div className="desk-windows">
        {folder && (
          <section className="win">
            <header>실습_데모</header>
            <p className="win-empty">이 폴더는 비어 있습니다.</p>
          </section>
        )}
        {trash && (
          <section className="win">
            <header>휴지통</header>
            <table className="win-table">
              <thead>
                <tr><th>이름</th><th>삭제한 날짜</th><th>원래 위치</th></tr>
              </thead>
              <tbody>
                {/* 표 내용은 서버가 준 증거 문장에서 나눈다: "파일 / 삭제: … / 원래 위치: …" */}
                <tr>{trash.text.split(" / ").map((t, i) => <td key={i}>{t.replace(/^(삭제|원래 위치):\s*/, "")}</td>)}</tr>
              </tbody>
            </table>
          </section>
        )}
        {chat && (
          <section className="win chat-win">
            <header>단체 대화방</header>
            {chat.text.split(" / ").map((t, i) => <p key={i} className="chat-line">{t}</p>)}
          </section>
        )}
      </div>
      <div className="taskbar"><span className="start">■</span><span className="clock">10:15</span></div>
    </div>
  );
}

/** 건희의 화면: 코드 편집기와 오류 창. */
function Editor({ found, onSpot }: { found: (id: string) => { text: string } | undefined; onSpot: (h: Hotspot) => void }) {
  const ed = found("c9");
  return (
    <div className="pc-screen editor">
      <button className="editor-win" onClick={() => onSpot({ id: "d-editor-main", label: "코드 편집기", x: 0, y: 0, w: 0, h: 0 })} aria-label="코드 편집기 살펴보기">
        <header>편집기 — 건희_실습</header>
        <div className="code-lines" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ width: `${30 + ((i * 37) % 55)}%` }} />)}
        </div>
        <footer>{ed ? ed.text.split(",")[0] : "…"}</footer>
      </button>
      <div className="error-pop" aria-hidden="true">
        <header>오류</header>
        <p>!</p>
      </div>
    </div>
  );
}
