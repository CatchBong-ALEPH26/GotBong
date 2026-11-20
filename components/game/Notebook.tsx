"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 아이콘과 초상 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Evidence, GameView, Message } from "@/lib/view/types";
import type { GameActions } from "@/lib/api/useGame";
import { Modal } from "@/components/ui/Modal";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PinnableText } from "./PinnableText";
import { play } from "@/lib/audio/sound";

export type AccuseDraft = { who: string; motive: string };
export const emptyAccuseDraft: AccuseDraft = { who: "", motive: "" };

export const PAGES = ["단서 노트", "대상별 기록", "사건 순서", "최종 추리"] as const;
export const PAGE_LOG = 1;

const KIND_LABEL: Record<Evidence["kind"], string> = { scene: "현장 단서", testimony: "증언" };

/**
 * 종이 수첩. 위쪽 책갈피나 쪽 넘김으로 이동한다.
 * 1쪽 단서 노트(현장 단서·증언) / 2쪽 대상별 문답 / 3쪽 사건 순서 / 4쪽 최종 추리(범인 + 동기 자유 서술).
 */
export function Notebook(props: {
  view: GameView;
  actions: GameActions;
  page: number;
  setPage: (p: number) => void;
  accuse: AccuseDraft;
  setAccuse: (d: AccuseDraft) => void;
  logSuspect: string;
  setLogSuspect: (id: string) => void;
  onPin: (m: Message, sentence: string) => void;
  onPresent: (evidenceId: string) => void;
  onClose: () => void;
}) {
  const { view, page, setPage, onClose } = props;
  return (
    <div className="overlay notebook-overlay" onClick={onClose}>
      <div className="paper book" role="dialog" aria-label={`수첩 · ${PAGES[page]}`} onClick={(e) => e.stopPropagation()}>
        <button className="paper-close" onClick={onClose} aria-label="수첩 닫기"><PixelIcon name="close" size={16} /></button>
        <nav className="book-tabs" aria-label="수첩 쪽">
          {PAGES.map((p, i) => (
            <button key={p} className={`book-tab ${page === i ? "on" : ""}`} onClick={() => setPage(i)} aria-current={page === i ? "page" : undefined}>
              {p}
            </button>
          ))}
        </nav>
        <div className={`book-body page-${page}`}>
          {page === 0 && <CluePages {...props} />}
          {page === 1 && <LogPages {...props} />}
          {page === 2 && <SequencePage {...props} />}
          {page === 3 && <AccusePages {...props} />}
        </div>
        <div className="book-foot">
          <button className="page-turn" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="앞 쪽">
            <PixelIcon name="left" size={16} /> <span>{page > 0 ? PAGES[page - 1] : ""}</span>
          </button>
          <span className="page-no">{page + 1} / {PAGES.length}</span>
          <button className="page-turn" onClick={() => setPage(page + 1)} disabled={page === PAGES.length - 1} aria-label="다음 쪽">
            <span>{page < PAGES.length - 1 ? PAGES[page + 1] : ""}</span> <PixelIcon name="right" size={16} />
          </button>
        </div>
        {view.me.submitted && <span className="stamp done-stamp" aria-hidden="true">제출 완료</span>}
      </div>
    </div>
  );
}

/** 1쪽: 단서 노트. 이름·위치·사실 텍스트만 적는다 (규칙 v2 4장). */
function CluePages({ view, onPresent }: { view: GameView; onPresent: (id: string) => void }) {
  const [pick, setPick] = useState<string | null>(view.evidence[0]?.id ?? null);
  const cur = view.evidence.find((c) => c.id === pick) ?? null;
  const nameOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)?.name ?? "";
  const shownTo = (id: string) => [...new Set(view.messages.filter((m) => m.clueId === id).map((m) => m.suspectId))];
  return (
    <>
      <section className="page">
        <h2 className="hand-title">단서 노트</h2>
        {view.evidence.length === 0 ? (
          <p className="pencil">아직 비어 있다. 장면에서 수상한 곳을 눌러 보고, 사람들에게 물어보자.</p>
        ) : (
          (["scene", "testimony"] as const).map((k) => {
            const list = view.evidence.filter((e) => e.kind === k);
            if (list.length === 0) return null;
            return (
              <div key={k} className="clue-group">
                <p className="pencil small">{KIND_LABEL[k]} {list.length}</p>
                <div className="clue-grid">
                  {list.map((c) => (
                    <button key={c.id} className={`clue-card ${pick === c.id ? "on" : ""}`} onClick={() => setPick(c.id)} aria-pressed={pick === c.id}>
                      <img src={c.icon} alt="" />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
      <section className="page">
        <h2 className="hand-title">{cur ? cur.name : "사건 개요"}</h2>
        {cur ? (
          <div className="clue-detail">
            <p className="pencil small">{KIND_LABEL[cur.kind]} · {cur.place}{cur.timeLabel ? ` · ${cur.timeLabel}` : ""}</p>
            <p className="ink">{cur.text}</p>
            {shownTo(cur.id).length > 0 && <p className="pencil small">내밀어 본 사람 · {shownTo(cur.id).map(nameOf).join(", ")}</p>}
            {!view.me.submitted && (
              <button className="paper-btn" onClick={() => onPresent(cur.id)}>
                <PixelIcon name="clip" size={12} /> 이 증거를 내밀기
              </button>
            )}
          </div>
        ) : (
          <p className="ink">{view.scenario.intro}</p>
        )}
      </section>
    </>
  );
}

/** 2쪽: 대상별 기록. 사람을 고르면 문답과 그 사람에게서 얻은 증언이 나온다. */
function LogPages({ view, logSuspect, setLogSuspect, onPin }: { view: GameView; logSuspect: string; setLogSuspect: (id: string) => void; onPin: (m: Message, s: string) => void }) {
  const s = view.scenario.suspects.find((x) => x.id === logSuspect) ?? view.scenario.suspects[0];
  const log = view.messages.filter((m) => m.suspectId === s.id);
  const said = view.evidence.filter((e) => e.kind === "testimony" && e.suspectId === s.id);
  const evName = (id: string | null) => view.evidence.find((c) => c.id === id)?.name;
  return (
    <>
      <section className="page">
        <h2 className="hand-title">용의자</h2>
        <ul className="suspect-rows">
          {view.scenario.suspects.map((x) => {
            const n = view.messages.filter((m) => m.suspectId === x.id).length;
            const t = view.evidence.filter((e) => e.kind === "testimony" && e.suspectId === x.id).length;
            return (
              <li key={x.id}>
                <button className={`suspect-pick ${x.id === s.id ? "on" : ""}`} onClick={() => setLogSuspect(x.id)} aria-pressed={x.id === s.id}>
                  <img className="face" src={x.portraits.neutral} alt="" />
                  <span className="who">
                    <b>{x.name}</b>
                    <span className="pencil">{x.role}</span>
                  </span>
                  <span className="pencil tally">문답 {n}{t > 0 && ` · 증언 ${t}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="page">
        <h2 className="hand-title">{s.name} · 문답</h2>
        {said.length > 0 && (
          <ul className="said-list">
            {said.map((e) => (
              <li key={e.id}><b>증언</b> {e.text}</li>
            ))}
          </ul>
        )}
        {log.length === 0 ? (
          <p className="pencil">아직 묻지 않았다. 장면에서 {s.name}을(를) 눌러 질문하자.</p>
        ) : (
          <>
            <ol className="log">
              {log.map((m) => (
                <li key={m.id}>
                  <p className="q">
                    Q. {m.question || <i>(말없이 증거를 내밀었다)</i>}
                    {m.clueId && <span className="stamp-mini">증거: {evName(m.clueId)}</span>}
                  </p>
                  <div className="a">
                    <span>A.</span>
                    <PinnableText text={m.answer} animate={false} isPinned={(t) => view.notes.some((n) => n.messageId === m.id && n.text === t)} onPin={(t) => onPin(m, t)} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="pencil small">문장을 누르면 밑줄을 쳐 둔다 (내 메모).</p>
          </>
        )}
      </section>
    </>
  );
}

type Line = { id: string; d: string; mx: number; my: number; memo: string };

/**
 * 3쪽: 사건 순서. 서버가 정한 순서대로 단서와 증언을 위에서 아래로 늘어놓는다.
 * 컴퓨터 기록은 정확한 시각, 사람의 증언은 대략적인 표현으로 보인다 (시나리오 0장 시각 표기 원칙).
 * 두 장을 골라 연필로 이을 수 있다 (내 메모, 서버 판정과 무관).
 */
function SequencePage({ view, actions, onPresent }: { view: GameView; actions: GameActions; onPresent: (id: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const timed = view.evidence.filter((e) => e.order !== null).sort((a, b) => a.order! - b.order! || a.foundAt - b.foundAt);
  const untimed = view.evidence.filter((e) => e.order === null);
  const nameOf = (id: string) => view.evidence.find((e) => e.id === id)?.name ?? "";
  const linked = new Set(view.contradictions.flatMap((c) => [c.a, c.b]));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));

  const measure = useCallback(() => {
    const root = wrap.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const rect = (id: string) => {
      const el = root.querySelector<HTMLElement>(`[data-ev="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.right - box.left, y: r.top - box.top + r.height / 2 };
    };
    const out: Line[] = [];
    for (const c of view.contradictions) {
      const a = rect(c.a);
      const b = rect(c.b);
      if (!a || !b) continue;
      const bulge = Math.max(a.x, b.x) + 40 + Math.abs(a.y - b.y) * 0.15;
      out.push({ id: c.id, d: `M ${a.x} ${a.y} C ${bulge} ${a.y} ${bulge} ${b.y} ${b.x} ${b.y}`, mx: bulge - 8, my: (a.y + b.y) / 2, memo: c.memo });
    }
    setLines(out);
  }, [view.contradictions]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measure, view.evidence]);

  const row = (e: Evidence) => (
    <li key={e.id}>
      <button data-ev={e.id} className={`seq-item ${e.kind} ${sel.includes(e.id) ? "sel" : ""} ${linked.has(e.id) ? "linked" : ""}`} onClick={() => toggle(e.id)} aria-pressed={sel.includes(e.id)}>
        <span className={`seq-time ${e.exact ? "exact" : ""}`}>{e.timeLabel ?? "—"}</span>
        <img src={e.icon} alt="" />
        <span className="seq-text"><b>{e.name}</b> {e.text}</span>
      </button>
    </li>
  );

  return (
    <section className="page wide">
      <h2 className="hand-title">사건 순서</h2>
      {view.evidence.length === 0 ? (
        <p className="pencil empty-note">단서와 증언이 모이면 여기에 일어난 순서대로 놓인다. 두 장을 골라 연필로 이어 볼 수 있다.</p>
      ) : (
        <div className="seq-wrap" ref={wrap}>
          <ol className="seq">{timed.map(row)}</ol>
          {untimed.length > 0 && (
            <>
              <p className="pencil small">시간과 관계없는 단서</p>
              <ol className="seq">{untimed.map(row)}</ol>
            </>
          )}
          <svg className="tl-lines" aria-hidden="true">
            {lines.map((l) => (
              <g key={l.id}>
                <path d={l.d} />
                <text x={l.mx} y={l.my} textAnchor="end">{l.memo || "모순?"}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
      {view.contradictions.length > 0 && (
        <ul className="memo-list">
          {view.contradictions.map((c) => (
            <li key={c.id}>
              <PixelIcon name="pencil" size={12} /> {nameOf(c.a)} ↔ {nameOf(c.b)}{c.memo && ` · ${c.memo}`}
              <button className="paper-link red" onClick={() => actions.removeContradiction(c.id)}>지우기</button>
            </li>
          ))}
        </ul>
      )}
      {sel.length > 0 && (
        <div className="scrap-bar" role="region" aria-label="고른 단서">
          {sel.length === 1 && !view.me.submitted && (
            <button className="paper-btn" onClick={() => onPresent(sel[0])}><PixelIcon name="clip" size={12} /> 이 증거를 내밀기</button>
          )}
          {sel.length === 2 && (
            <>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={30} placeholder="어디가 어긋나? (선택)" aria-label="연필 메모" />
              <button
                className="paper-btn red"
                onClick={() => {
                  actions.addContradiction(sel[0], sel[1], memo.trim());
                  setSel([]);
                  setMemo("");
                }}
              >
                <PixelIcon name="pencil" size={12} /> 연필로 잇기
              </button>
            </>
          )}
          <button className="paper-link" onClick={() => setSel([])}>선택 해제</button>
        </div>
      )}
    </section>
  );
}

/** 4쪽: 최종 추리. 범인 1명 + 동기(자유 서술)를 한 번 제출한다. 동기는 서버가 뜻으로 채점한다. */
function AccusePages({ view, actions, accuse, setAccuse }: { view: GameView; actions: GameActions; accuse: AccuseDraft; setAccuse: (d: AccuseDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<AccuseDraft>) => setAccuse({ ...accuse, ...p });
  const suspect = view.scenario.suspects.find((s) => s.id === accuse.who);
  const motive = accuse.motive.trim();
  const ready = !!suspect && !!motive;
  const done = view.me.submitted;
  // 동기 문장 도우미: 계기(무슨 일 때문에)와 목적(무엇을 하려고)이 들어 있는지 가볍게 본다. 제출을 막지는 않는다.
  const hasCause = /때문|해서|당해|당했|받아서|받고|화가|서운|억울|놀림|놀려/.test(motive);
  const hasGoal = /려고|려는|려 했|싶어서|싶었|위해|하게 하|만들/.test(motive);
  const tooShort = motive.length > 0 && motive.length < 10;
  const myNotes = suspect ? view.notes.filter((n) => n.suspectId === suspect.id) : [];

  return (
    <>
      <section className="page">
        <h2 className="hand-title">최종 추리</h2>
        <p className="pencil small">범인 1명과 동기. 제출은 한 번뿐이고 고칠 수 없다.</p>
        <div className="verdict-sentence">
          <p>
            범인은{" "}
            <button className={`blank ${suspect ? "filled" : ""} ${open ? "open" : ""}`} onClick={() => setOpen(!open)} disabled={done}>
              {suspect?.name ?? "누구"}
            </button>
            .
          </p>
          {open && (
            <div className="choices faces">
              {view.scenario.suspects.map((s) => (
                <button key={s.id} className={accuse.who === s.id ? "on" : ""} onClick={() => (set({ who: s.id }), setOpen(false))}>
                  <img src={s.portraits.neutral} alt="" />
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <p>왜 {view.scenario.victim}의 프로그램을 없앴을까?</p>
          <div className="motive-field">
            <textarea
              className="motive-input"
              rows={3}
              maxLength={500}
              value={accuse.motive}
              disabled={done}
              onChange={(e) => set({ motive: e.target.value })}
              placeholder="예) 오전에 ○○한 일 때문에, △△하려고"
              aria-label="동기"
              aria-describedby="motive-help"
            />
            <span className="motive-count">{accuse.motive.length}/500</span>
          </div>
          {!done && (
            <div id="motive-help" className="motive-help">
              <p className="pencil small">한 문장에 두 가지를 담으면 좋다. 표현이 달라도 뜻이 맞으면 정답이다.</p>
              <ul className="motive-checks">
                <li className={hasCause ? "ok" : ""}>{hasCause ? "✓" : "○"} 계기: 무슨 일 때문에</li>
                <li className={hasGoal ? "ok" : ""}>{hasGoal ? "✓" : "○"} 목적: 무엇을 하려고</li>
              </ul>
              {tooShort && <p className="pencil small warn-ink">조금 더 구체적으로 써 보자. 그래도 제출은 된다.</p>}
            </div>
          )}
          {!done && myNotes.length > 0 && (
            <div className="motive-notes">
              <p className="pencil small">{suspect!.name}에 대해 밑줄 친 말</p>
              <ul>
                {myNotes.slice(-4).map((n) => (
                  <li key={n.id}>“{n.text}”</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      <section className="page">
        <h2 className="hand-title">제출</h2>
        {done ? (
          <div className="submitted-note">
            <p className="ink">추리를 제출했다.</p>
          </div>
        ) : (
          <>
            <ul className="ready-list">
              <li className={suspect ? "ok" : ""}>{suspect ? "✓" : "○"} 범인을 골랐다</li>
              <li className={motive ? "ok" : ""}>{motive ? "✓" : "○"} 동기를 썼다</li>
            </ul>
            <ul className="pencil-list">
              <li>질문이 남아 있어도 제출할 수 있다.</li>
              <li>범인과 동기를 모두 맞혀야 해결이다.</li>
              <li>AI가 동기의 뜻을 채점하느라 몇 초 걸린다.</li>
            </ul>
            <button className="stamp-btn" disabled={!ready} onClick={() => (setError(null), setConfirm(true))}>
              제출 · 한 번뿐
            </button>
          </>
        )}
      </section>
      {confirm && (
        <Modal
          title="이대로 제출할까?"
          onClose={() => !busy && setConfirm(false)}
          actions={
            <>
              <button className="px-btn" disabled={busy} onClick={() => setConfirm(false)}>다시 볼래</button>
              <button
                className="px-btn danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await actions.accuse({ suspectId: accuse.who, motive });
                    play("stamp");
                    setConfirm(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "채점하는 중…" : error ? "같은 답으로 다시 제출" : "제출한다"}
              </button>
            </>
          }
        >
          <p className="say">
            범인은 <b>{suspect?.name}</b>.<br />
            동기는 “{motive}”
          </p>
          {!busy && !error && (!hasCause || !hasGoal) && <p className="dim">계기나 목적이 빠진 것 같다. 다시 보고 싶으면 “다시 볼래”.</p>}
          {error ? <p className="warn" role="alert">{error} 아직 제출되지 않았다.</p> : <p className="warn">제출하면 조사와 질문이 끝나고 고칠 수 없다.</p>}
        </Modal>
      )}
    </>
  );
}
