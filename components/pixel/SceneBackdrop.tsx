/* eslint-disable @next/next/no-img-element -- 픽셀 배경 */
/** 로비·대기실·보고서 뒤에 어둡게 깔리는 교실 장면. */
export function SceneBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <img src="/game/scenes/classroom.png" alt="" draggable={false} />
    </div>
  );
}
