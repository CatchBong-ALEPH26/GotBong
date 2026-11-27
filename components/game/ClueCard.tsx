"use client";
import type { ClueForm } from "@/lib/view/types";

/**
 * 단서·자료를 실제 물건 모양으로 그린다 (시나리오 5.3절).
 * window 강사님 모니터의 창 / paper 종이 / object 실물 / phone 스마트폰 화면 / files 개인 PC의 파일 목록.
 * 글은 서버가 준 문장 그대로다. 줄바꿈으로 줄을 나누고, " / "로 칸을 나눈다. "이름: 말"은 스마트폰에서 말풍선이 된다.
 */
export function ClueCard({ form, title, text, size = "md" }: { form: ClueForm; title: string; text: string; size?: "sm" | "md" | "lg" }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const cells = (l: string) => l.split(" / ");
  const cls = `cc cc-${form} cc-${size}`;

  if (form === "window" || form === "files")
    return (
      <figure className={cls} aria-label={title}>
        <figcaption className="cc-bar">
          <span>{title}</span>
          <span className="cc-x" aria-hidden="true">×</span>
        </figcaption>
        <div className="cc-rows">
          {lines.map((l, i) => {
            const c = cells(l);
            // "이름: 값" 한 칸짜리 줄은 속성 창처럼 이름과 값을 나눠 보여 준다.
            const kv = c.length === 1 ? l.match(/^([^:]{1,14}):\s*(.+)$/) : null;
            return (
              <p key={i} className="cc-row">
                {kv ? (
                  <>
                    <span className="cc-key">{kv[1]}</span>
                    <span>{kv[2]}</span>
                  </>
                ) : (
                  c.map((x, j) => <span key={j}>{x}</span>)
                )}
              </p>
            );
          })}
        </div>
      </figure>
    );

  if (form === "phone") {
    // 첫 줄이 "이름: 말"이 아니면 대화창 위의 날짜 줄로 쓴다.
    const bubble = (l: string) => l.match(/^([^:]{1,10}):\s*(.+)$/);
    return (
      <figure className={cls} aria-label={title}>
        <span className="cc-notch" aria-hidden="true" />
        <figcaption className="cc-phone-title">{title}</figcaption>
        <div className="cc-chat">
          {lines.map((l, i) => {
            const b = bubble(l);
            return b ? (
              <p key={i} className="cc-bubble">
                <b>{b[1]}</b>
                {b[2]}
              </p>
            ) : (
              <p key={i} className="cc-chat-note">{l}</p>
            );
          })}
        </div>
      </figure>
    );
  }

  if (form === "object")
    return (
      <figure className={cls} aria-label={title}>
        <div className="cc-usb" aria-hidden="true">
          <span className="cc-usb-plug" />
          <span className="cc-usb-body">
            <span className="cc-usb-sticker">{lines.find((l) => l.includes("스티커"))?.split(":").pop()?.trim() ?? ""}</span>
          </span>
        </div>
        <figcaption>
          <b>{title}</b>
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </figcaption>
      </figure>
    );

  return (
    <figure className={cls} aria-label={title}>
      <span className="cc-pin" aria-hidden="true" />
      <figcaption className="cc-paper-title">{title}</figcaption>
      {lines.map((l, i) => (
        <p key={i} className="cc-line">{l}</p>
      ))}
    </figure>
  );
}
