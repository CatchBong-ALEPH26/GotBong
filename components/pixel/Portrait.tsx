/* eslint-disable @next/next/no-img-element -- 픽셀 그림은 원본 그대로, 확대 시 계단을 유지해야 한다 */
/** 픽셀 초상. 프레임 안에 정수 배율에 가깝게 띄운다. */
export function Portrait({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <span className={`portrait ${className}`}>
      <img src={src} alt={alt} draggable={false} />
    </span>
  );
}
