"use client";
import { useEffect, useState } from "react";

export const splitSentences = (text: string) => text.split(/(?<=[.!?…])\s+/).filter(Boolean);

/**
 * 용의자 답변. 새 답변은 한 글자씩 찍히고(누르면 바로 완성), 다 나오면 문장을 눌러 수첩에 적을 수 있다.
 */
export function PinnableText(props: { text: string; animate: boolean; isPinned: (s: string) => boolean; onPin: (s: string) => void; onDone?: () => void }) {
  const { text, animate, isPinned, onPin, onDone } = props;
  const [n, setN] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    setN(0);
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 1)), 32);
    return () => clearInterval(t);
  }, [animate, text]);

  const done = n >= text.length;
  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);

  if (!done)
    return (
      <p className="say typing" onClick={() => setN(text.length)}>
        {text.slice(0, n)}
        <span className="caret" aria-hidden="true" />
      </p>
    );
  return (
    <p className="say lines">
      {splitSentences(text).map((s, i) => {
        const on = isPinned(s);
        return (
          <button key={i} className={`sentence ${on ? "pinned" : ""}`} onClick={() => !on && onPin(s)} aria-pressed={on} title={on ? "수첩에 적었음" : "눌러서 수첩에 적기"}>
            {s}
            {on && <span className="pin-mark" aria-hidden="true">✎</span>}
          </button>
        );
      })}
      {animate && <span className="sr-only" aria-live="polite">{text}</span>}
    </p>
  );
}
