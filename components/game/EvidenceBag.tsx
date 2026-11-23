"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 아이콘 */
import { useState } from "react";
import type { Evidence, GameView } from "@/lib/view/types";
import { PixelIcon } from "@/components/pixel/PixelIcon";

const GROUPS: { kind: Evidence["kind"]; label: string }[] = [
  { kind: "scene", label: "현장 단서" },
  { kind: "testimony", label: "증언" },
];

/** 증거 고르기 창. 현장 단서와 다른 사람의 말(증언)을 내밀 수 있다. 지금 묻는 사람 본인의 말은 빠진다. */
/** 열릴 때 창으로 포커스를 옮긴다. 모듈 함수라 다시 그려도 다시 불리지 않는다. */
const focusOnOpen = (el: HTMLElement | null) => {
  el?.focus({ preventScroll: true });
};

export function EvidenceBag({ view, target, selectedId, onUse, onClose }: { view: GameView; target: string | null; selectedId: string | null; onUse: (id: string) => void; onClose: () => void }) {
  const usable = view.evidence.filter((e) => !target || e.suspectId !== target);
  const [pick, setPick] = useState<string | null>(selectedId ?? usable[0]?.id ?? null);
  const cur = usable.find((c) => c.id === pick) ?? null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="bag px" role="dialog" aria-modal="true" aria-label="증거 고르기" tabIndex={-1} ref={focusOnOpen} onClick={(e) => e.stopPropagation()}>
        <div className="bag-head">
          <span className="px-tag"><PixelIcon name="bag" size={14} /> 내밀 증거 고르기</span>
          <button className="px-btn small icon" onClick={onClose} aria-label="닫기"><PixelIcon name="close" size={14} /></button>
        </div>
        <div className="bag-scroll">
          {GROUPS.map((g) => {
            const list = usable.filter((e) => e.kind === g.kind);
            if (list.length === 0) return null;
            return (
              <section key={g.kind}>
                <p className="bag-group">{g.label}</p>
                <div className="bag-grid">
                  {list.map((c) => (
                    <button key={c.id} className={`slot ${pick === c.id ? "on" : ""}`} onClick={() => setPick(c.id)} onDoubleClick={() => onUse(c.id)} aria-pressed={pick === c.id}>
                      <img src={c.icon} alt="" />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {cur ? (
          <div className="bag-detail">
            <img src={cur.icon} alt="" />
            <div>
              <b>{cur.name}</b>
              <p>{cur.text}</p>
            </div>
          </div>
        ) : (
          <p className="bag-empty">아직 수첩이 비어 있다. 장면에서 수상한 곳을 눌러 보자.</p>
        )}
        <div className="bag-actions">
          <button className="px-btn" onClick={onClose}>닫기</button>
          <button className="px-btn on" disabled={!cur || view.me.submitted} onClick={() => cur && onUse(cur.id)}>
            이 증거를 내민다
          </button>
        </div>
      </div>
    </div>
  );
}
