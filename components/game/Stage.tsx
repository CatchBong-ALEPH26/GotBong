"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 배경은 원본 그대로 계단을 유지해 확대한다 */
import type { GameView, Hotspot, Scene } from "@/lib/view/types";

export type Hit = { type: "suspect"; id: string } | { type: "spot"; spot: Hotspot } | { type: "empty" };

const area = (h: { w: number; h: number }) => h.w * h.h;

/**
 * 현재 장소의 장면. 조사할 수 있는 곳은 화면에 아무 표시도 하지 않는다.
 * 커서는 장면 어디서나 같은 모양이라 마우스를 움직여 위치를 알아낼 수도 없다.
 * 겹치는 영역은 큰 사물 → 사람 → 작은 사물(키보드, 휴대폰 등) 순으로 위에 쌓는다.
 */
export function Stage(props: { view: GameView; scene: Scene; target: string | null; disabled: boolean; onHit: (h: Hit) => void }) {
  const { view, scene, target, disabled, onHit } = props;
  const box = (r: { x: number; y: number; w: number; h: number }) => ({ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` });
  const fire = (h: Hit) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) onHit(h);
  };
  const nameOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)?.name ?? "";
  const big = scene.hotspots.filter((h) => area(h) >= 150);
  const small = scene.hotspots.filter((h) => area(h) < 150);
  const spot = (h: Hotspot) => <button key={h.id} className="hit" style={box(h)} tabIndex={-1} aria-label={h.label} onClick={fire({ type: "spot", spot: h })} />;

  return (
    <div key={scene.id} className="stage scene-in cursor-look" onClick={fire({ type: "empty" })}>
      <img className="stage-img" src={scene.background} alt={`학원 ${scene.name}`} draggable={false} />
      {big.map(spot)}
      {scene.people.map((p) => (
        <button key={p.suspectId} className="hit suspect" style={box(p.hit)} aria-label={nameOf(p.suspectId)} aria-pressed={target === p.suspectId} onClick={fire({ type: "suspect", id: p.suspectId })} />
      ))}
      {small.map(spot)}
    </div>
  );
}
