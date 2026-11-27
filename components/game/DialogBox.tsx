"use client";
import { useEffect, useRef, useState } from "react";
import type { GameView, Message } from "@/lib/view/types";
import { questionsLeft } from "@/lib/view/rules";
import { Portrait } from "@/components/pixel/Portrait";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PinnableText } from "./PinnableText";

export type Draft = { question: string; clueId: string | null };
export const emptyDraft: Draft = { question: "", clueId: null };

export type Dialog =
  | { kind: "narrate"; key: string; title: string; text: string; image?: { src: string; alt: string; item?: boolean }; figure?: { src: string; alt: string }; found?: "new" | "again"; hint?: boolean }
  | { kind: "prompt"; key: string; text: string }
  | { kind: "notice"; key: string; text: string; used?: number } // 탐정 속마음 안내 (되묻기·반려·오류). 써 둔 질문은 남아 있다. used: 이번에 쓴 질문 수(연속 무차감 뒤 1회)
  | { kind: "edit" }
  | { kind: "thinking"; since: number }
  | { kind: "answer"; messageId: string; animate: boolean; used?: number; thought?: string }; // used: 이번 메시지가 쓴 질문 수, thought: 반복 실패 힌트 속마음

/** 하단 레트로 대사창. 관찰문, 안내, 질문 입력, 답변을 같은 자리에서 한 번에 하나씩 보여 준다. */
export function DialogBox(props: {
  view: GameView;
  dialog: Dialog;
  target: string | null;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onAsk: () => void;
  onCancel: () => void;
  onOpenBag: () => void;
  onAskAgain: () => void;
  onBacklog: (suspectId: string) => void;
  onPin: (m: Message, sentence: string) => void;
}) {
  const { view, dialog, target, draft, setDraft, onAsk, onCancel, onOpenBag, onAskAgain, onBacklog, onPin } = props;
  const suspect = view.scenario.suspects.find((s) => s.id === target) ?? null;
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (dialog.kind === "edit") input.current?.focus({ preventScroll: true });
  }, [dialog.kind, target]);

  if (dialog.kind === "narrate" || dialog.kind === "prompt") {
    const title = dialog.kind === "narrate" ? dialog.title : "탐정";
    const isHint = dialog.kind === "narrate" && dialog.hint;
    return (
      <section className={`dialog px ${isHint ? "is-hint" : ""}`} aria-live="polite">
        {dialog.kind === "narrate" && dialog.image && (
          <div className={`dialog-face ${dialog.image.item ? "item" : ""}`}>
            <Portrait src={dialog.image.src} alt={dialog.image.alt} />
          </div>
        )}
        <div className="dialog-main">
          <span className="px-tag">{isHint && <PixelIcon name="bulb" size={12} />} {title}</span>
          <p className="say">{dialog.text}</p>
          {dialog.kind === "narrate" && dialog.found && (
            <p className={`found ${dialog.found}`}>{dialog.found === "new" ? "▶ 수첩 단서 노트에 적었다" : "▶ 이미 수첩에 있는 단서다"}</p>
          )}
        </div>
      </section>
    );
  }

  if (dialog.kind === "notice")
    return (
      <section className="dialog px" aria-live="polite">
        <div className="dialog-main">
          <span className="px-tag">탐정</span>
          <p className="say">{dialog.text}</p>
          <p className="found again">{dialog.used ? `▶ 질문 ${dialog.used}회 사용` : "▶ 질문 횟수는 줄지 않았다"}</p>
          {suspect && (
            <div className="dialog-foot">
              <span />
              <button className="next-btn" onClick={onAskAgain} aria-label="다시 묻기">
                다시 묻기 <span className="next-arrow" aria-hidden="true">▼</span>
              </button>
            </div>
          )}
        </div>
      </section>
    );

  if (!suspect) return <section className="dialog px"><div className="dialog-main"><p className="say">물어볼 사람을 장면에서 눌러 줘.</p></div></section>;

  const log = view.messages.filter((m) => m.suspectId === suspect.id);

  if (dialog.kind === "thinking") return <Thinking name={suspect.name} since={dialog.since} />;

  if (dialog.kind === "answer") {
    const m = view.messages.find((x) => x.id === dialog.messageId);
    if (!m) return null;
    const pinned = (s: string) => view.notes.some((n) => n.messageId === m.id && n.text === s);
    return (
      <section className="dialog px">
        <div className="dialog-main">
          <span className="px-tag">{suspect.name}</span>
          <PinnableText key={m.id} text={m.answer} animate={dialog.animate} isPinned={pinned} onPin={(s) => onPin(m, s)} />
          {!!dialog.used && <p className="found again">▶ 질문 {dialog.used}회 사용</p>}
          {dialog.thought && (
            <p className="found thought">
              <PixelIcon name="bulb" size={12} /> {dialog.thought}
            </p>
          )}
          <div className="dialog-foot">
            <button className="link-btn" onClick={() => onBacklog(suspect.id)}>수첩에서 기록 보기</button>
            <button className="next-btn" onClick={onAskAgain} aria-label="이어서 묻기">
              이어서 묻기 <span className="next-arrow" aria-hidden="true">▼</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 질문 입력 (자유 입력 + 추천 질문, 증거만 내밀 수도 있다)
  const left = questionsLeft(view);
  const blocked = view.me.submitted || left <= 0;
  const clue = view.evidence.find((c) => c.id === draft.clueId);
  const canSend = !blocked && (!!draft.question.trim() || !!clue);
  const send = () => canSend && onAsk();
  const tips = view.scenario.suggestions.filter((t) => !log.some((m) => m.question === t));

  return (
    <section className="dialog px editing">
      <div className="dialog-main">
        <div className="edit-head">
          <span className="px-tag">{suspect.name}</span>
          <span className="edit-tools">
            <button className="px-btn small" onClick={onOpenBag} disabled={blocked || view.evidence.length === 0}>
              <PixelIcon name="clip" size={14} /> 증거 내밀기
            </button>
            {log.length > 0 && (
              <button className="px-btn small" onClick={() => onBacklog(suspect.id)}>기록</button>
            )}
          </span>
        </div>
        {tips.length > 0 && !blocked && (
          <div className="tips" aria-label="추천 질문">
            {tips.slice(0, 3).map((t) => (
              <button key={t} className="tip" onClick={() => setDraft({ ...draft, question: t })}>{t}</button>
            ))}
          </div>
        )}
        {clue && (
          <div className="attach">
            <span className="px-chip chip-item">
              <PixelIcon name="clip" size={12} /> {clue.name}
              <button aria-label="증거 빼기" onClick={() => setDraft({ ...draft, clueId: null })}>×</button>
            </span>
            <span className="hint">질문을 비워 두면 증거만 내민다</span>
          </div>
        )}
        <div className="edit-row">
          <div className="edit-field">
            <textarea
              ref={input}
              rows={2}
              value={draft.question}
              maxLength={view.config.questionMaxLength}
              disabled={blocked}
              placeholder={left <= 0 ? "질문을 다 썼다. 조사와 수첩 정리, 제출은 할 수 있다." : blocked ? "더 이상 물을 수 없다." : "물어볼 것을 적자. 한 번에 세 가지까지 물을 수 있다."}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              onKeyDown={(e) => {
                // 한글 조합 중 Enter는 보내지 않는다 (Safari는 isComposing 대신 keyCode 229로 알린다)
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape") onCancel();
              }}
              aria-label={`${suspect.name}에게 할 질문`}
            />
            <span className="count">{draft.question.length}/{view.config.questionMaxLength}</span>
          </div>
          <button className="px-btn ask-btn on" onClick={send} disabled={!canSend}>
            {clue && !draft.question.trim() ? "내밀기" : "묻기"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** AI 답변을 기다리는 2~4초. 말줄임이 하나씩 찍히고, 오래 걸리면 안내 문장이 바뀐다. 요청 중에는 입력을 받지 않는다. */
function Thinking({ name, since }: { name: string; since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(t);
  }, []);
  const sec = (now - since) / 1000;
  const line = sec < 2.5 ? `${name} · 잠깐 생각한다` : sec < 7 ? `${name} · 말을 고르는 것 같다` : "대답이 늦어진다. 조금만 기다려 보자";
  return (
    <section className="dialog px" aria-busy="true">
      <div className="dialog-main">
        <span className="px-tag">{name}</span>
        <p className="say thinking-dots" aria-hidden="true">
          <span>·</span>
          <span>·</span>
          <span>·</span>
        </p>
        <p className="found again" role="status">{line}</p>
      </div>
    </section>
  );
}
