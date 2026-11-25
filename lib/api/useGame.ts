"use client";

// 게임 API(app/api/*)에 붙는 게임 상태. 명세: docs/game/HANDOFF.md §3, 연결 안내: docs/game/INTEGRATION.md
// 서버가 아는 것: 사건 소개, 단서 카드 5장, 용의자, 대화 기록, 남은 질문, 결과.
// 화면만 아는 것(이 브라우저의 localStorage): 수사 시작 여부, 장면에서 찾은 단서, 밑줄 메모, 연필 선, 내가 낸 답.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Accusation, Contradiction, Emotion, Evidence, GameView, Message, Note, PublicScenario } from "@/lib/view/types";
import { CLUE_META, RULES, SPOT_TEXT, SPOT_TO_CLUE, SUGGESTIONS, TESTIMONY_ICON, art, classroom, closeups, fillVictim } from "@/lib/scene/classroom";

// ---------- 서버 응답 형태 (HANDOFF.md §3) ----------
type ServerAttach = { type: "clue"; id: string; title: string } | { type: "turn"; id: string; npc: string; reply: string } | null;
type ServerTurn = { id: string; npc: string; question: string; reply: string; emotion: string; attach: ServerAttach };
type ServerResult = { score: 0 | 1; grader?: "fixture" | "gemini" | "openai" | null; truth: string; cast: { npc: string; name: string; role: string; title: string }[] };
export type Session = {
  intro: string;
  victim: string;
  clues: { id: string; title: string; detail: string }[];
  npcs: { id: string; name: string; summary: string }[];
  mode: GameView["mode"];
  /** 이 게임의 메모 저장 칸 이름 (서버가 게임 ID로 만든 되돌릴 수 없는 값) */
  gameKey?: string;
  remaining: number;
  maxQuestions: number;
  turns: ServerTurn[];
  result: ServerResult | null;
};

type Local = {
  started: boolean;
  found: Record<string, number>; // 단서 id → 찾은 시각
  spots: Record<string, string>; // 단서 id → 찾은 곳 (모니터 단서는 누구 자리인지 보여 주려고)
  checked: string[];
  notes: Note[];
  contradictions: Contradiction[];
  mine: Accusation | null;
};
const emptyLocal: Local = { started: false, found: {}, spots: {}, checked: [], notes: [], contradictions: [], mine: null };

export type InvestigateResult = { evidence: Evidence | null; isNew: boolean; text: string };
/** used: 이번에 쓴 질문 수, thought: 반복 실패 힌트(탐정 속마음). 둘 다 서버의 선택 필드 */
export type AskResult = { type: "answer"; message: Message; used?: number; thought?: string } | { type: "notice"; text: string; used?: number };

export type GameActions = {
  beginInvestigation: () => void;
  investigate: (spotId: string) => Promise<InvestigateResult>;
  ask: (input: { suspectId: string; question: string; clueId: string | null }) => Promise<AskResult>;
  pinNote: (messageId: string, text: string) => void;
  unpinNote: (noteId: string) => void;
  addContradiction: (a: string, b: string, memo: string) => void;
  removeContradiction: (id: string) => void;
  /** 제출하고 결과(해결/미해결)를 돌려준다. */
  accuse: (a: Accusation) => Promise<"win" | "lose">;
  reset: () => Promise<void>;
};

/** 화면에 보여 줄 수 있는 오류 (서버의 error 문장 그대로). */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 응답을 이만큼 기다려도 안 오면 끊는다. 서버의 질문 마감(25초)보다 넉넉하게. */
const TIMEOUT_MS = 40_000;

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    res = await fetch(path, body === undefined ? { cache: "no-store", signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw new ApiError(0, "대답이 너무 늦다. 잠시 뒤에 다시 해 보자.");
    throw new ApiError(0, "연락이 닿지 않는다. 연결 상태를 확인하고 다시 해 보자.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? (res.status >= 500 ? "잠깐 정신이 멍했다. 조금 뒤에 다시 해 보자." : "뭔가 어긋났다. 다시 해 보자."));
  // 성공 응답인데 JSON 객체가 아니면(HTML 오류 페이지 등) 성공으로 다루지 않는다.
  if (!data || typeof data !== "object") throw new ApiError(res.status, "무슨 말인지 알아듣지 못했다. 잠시 뒤에 다시 해 보자.");
  return data as T;
}

/** 저장이 막혀 있거나 가득 차도 게임은 계속된다 (이번 화면에서만 기억). */
function saveLocal(key: string, value: Local) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 */
  }
}

const EMOTION: Record<string, Emotion> = { 기본: "neutral", 당황: "flustered", 화남: "angry", 웃음: "smile" };
const uid = () => crypto.randomUUID();
const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n) + "…" : s);
/** 게임마다 메모 저장 칸을 따로 쓴다. 서버가 준 게임 키를 쓰고, 예전 서버면 피해자 이름으로 나눈다. */
const storageKey = (s: Session) => (s.gameKey ? `gotbong:game:${s.gameKey}` : `gotbong:${s.victim}`);

function loadLocal(key: string): Local {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...emptyLocal, ...JSON.parse(raw) } : emptyLocal;
  } catch {
    return emptyLocal;
  }
}

function buildScenario(s: Session): PublicScenario {
  const v = (t: string) => fillVictim(t, s.victim);
  const scene = {
    ...classroom,
    hotspots: classroom.hotspots.map((h) => ({ ...h, label: v(h.label) })),
    people: classroom.people.filter((p) => s.npcs.some((n) => n.id === p.suspectId)),
  };
  const cus = Object.fromEntries(
    Object.entries(closeups).map(([id, c]) => [id, c.kind === "image" ? { ...c, title: v(c.title), hotspots: c.hotspots.map((h) => ({ ...h, label: v(h.label) })) } : { ...c, title: v(c.title) }]),
  );
  return {
    title: "유령 키보드",
    intro: s.intro,
    victim: s.victim,
    rules: RULES,
    scenes: [scene],
    closeups: cus,
    emptyText: "특별한 건 없어 보인다.",
    suspects: s.npcs.map((n) => ({ id: n.id, name: n.name, role: n.summary, ...art(n.id) })),
    suggestions: SUGGESTIONS.map(v),
  };
}

function clueEvidence(s: Session, id: string, foundAt: number, spotId?: string): Evidence | null {
  const c = s.clues.find((x) => x.id === id);
  if (!c) return null;
  const meta = CLUE_META[id] ?? { icon: TESTIMONY_ICON, place: "", order: null };
  // 서버 카드에는 주인 이름이 없다(찾기 전 유출 방지). 찾은 모니터의 주인을 붙여 보여 준다.
  const owner = spotId?.startsWith("monitor-") ? s.npcs.find((n) => n.id === spotId.slice("monitor-".length))?.name : undefined;
  if (owner) {
    return { id, kind: "scene", name: `${owner}의 ${c.title.replace(/^모니터의 /, "")}`, text: c.detail.replace("용의자 자리의 모니터", `${owner}의 모니터`), icon: meta.icon, place: `${owner}의 자리 모니터`, order: meta.order, timeLabel: meta.timeLabel, exact: !!meta.timeLabel, foundAt };
  }
  return { id, kind: "scene", name: c.title, text: c.detail, icon: meta.icon, place: fillVictim(meta.place, s.victim), order: meta.order, timeLabel: meta.timeLabel, exact: !!meta.timeLabel, foundAt };
}

function toMessage(t: ServerTurn, i: number): Message {
  return {
    id: t.id,
    suspectId: t.npc,
    question: t.question,
    clueId: t.attach ? (t.attach.type === "clue" ? t.attach.id : `turn:${t.attach.id}`) : null,
    answer: t.reply,
    emotion: EMOTION[t.emotion] ?? "neutral",
    createdAt: i,
  };
}

export function useGame(): { view: GameView | null; error: string | null; retry: () => void; actions: GameActions } {
  const [session, setSession] = useState<Session | null>(null);
  const [local, setLocal] = useState<Local>(emptyLocal);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // 실패한 요청을 같은 내용으로 다시 보낼 때는 같은 requestId를 쓴다 (서버의 중복 차감 방지).
  // 내용별로 따로 기억해서, 다른 질문을 먼저 보내도 앞 요청의 id가 지워지지 않는다. 성공하면 지운다.
  const pending = useRef(new Map<string, string>());

  const adopt = useCallback((s: Session) => {
    keyRef.current = storageKey(s);
    setLocal(loadLocal(keyRef.current));
    setSession(s);
  }, []);

  const load = useCallback(() => {
    let ignore = false;
    setError(null);
    api<Session>("/api/session")
      .then((s) => {
        if (!ignore) adopt(s);
      })
      .catch((e: Error) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [adopt]);

  useEffect(load, [load]);

  const update = useCallback((f: (l: Local) => Local) => {
    setLocal((l) => {
      const next = f(l);
      if (keyRef.current) saveLocal(keyRef.current, next);
      return next;
    });
  }, []);

  const requestId = (fingerprint: string) => {
    let id = pending.current.get(fingerprint);
    if (!id) pending.current.set(fingerprint, (id = uid()));
    return id;
  };

  const view = useMemo<GameView | null>(() => {
    if (!session) return null;
    const scenario = buildScenario(session);
    const nameOf = (id: string) => session.npcs.find((n) => n.id === id)?.name ?? "";
    const messages = session.turns.map(toMessage);
    const clues = Object.entries(local.found).flatMap(([id, at]) => clueEvidence(session, id, at, local.spots[id]) ?? []);
    const said: Evidence[] = session.turns.map((t, i) => ({
      id: `turn:${t.id}`,
      kind: "testimony",
      suspectId: t.npc,
      name: `${nameOf(t.npc)}: “${short(t.reply)}”`,
      place: `${nameOf(t.npc)}의 말`,
      text: t.reply,
      icon: TESTIMONY_ICON,
      order: null,
      foundAt: i,
    }));
    const r = session.result;
    const evidence = [...clues, ...said];
    return {
      mode: session.mode,
      config: { generalQuestions: session.maxQuestions, questionMaxLength: 500 },
      scenario,
      me: { questionsUsed: session.maxQuestions - session.remaining, started: local.started || session.turns.length > 0 || !!r, submitted: !!r },
      checked: local.checked,
      clues: session.clues.map((c) => ({ id: c.id, title: c.title, found: c.id in local.found, icon: CLUE_META[c.id]?.icon ?? TESTIMONY_ICON, timeLabel: CLUE_META[c.id]?.timeLabel })),
      evidence,
      messages,
      notes: local.notes,
      contradictions: local.contradictions,
      report: r
        ? {
            verdict: r.score === 1 ? "win" : "lose",
            mine: { culprit: nameOf(local.mine?.suspectId ?? ""), motive: local.mine?.motive ?? "" },
            truth: r.truth,
            grader: r.grader ?? null,
            // 서버 배정에서 역할 D가 범인이다 (HANDOFF.md §3, title도 "범인").
            cast: r.cast.map((c) => ({ name: c.name, title: c.title, culprit: c.role === "D" || c.title === "범인" })),
            usage: {
              pinned: local.notes.length,
              questionsUsed: session.maxQuestions - session.remaining,
              evidenceShown: [...new Set(messages.flatMap((m) => (m.clueId ? [evidence.find((e) => e.id === m.clueId)?.name ?? ""] : [])))].filter(Boolean),
            },
          }
        : null,
    };
  }, [session, local]);

  const beginInvestigation = useCallback(() => update((l) => ({ ...l, started: true })), [update]);

  const investigate = useCallback(
    async (spotId: string): Promise<InvestigateResult> => {
      const s = sessionRef.current!;
      let clueId = SPOT_TO_CLUE[spotId];
      let text = SPOT_TEXT[spotId];
      if (spotId.startsWith("monitor-")) {
        // 어느 사람의 모니터에 단서가 있는지는 범인을 알아야 정할 수 있어서 서버가 판정한다.
        const r = await api<{ clue: { id: string } | null }>("/api/investigate", { spot: spotId });
        if (r.clue) clueId = r.clue.id;
        else text = SPOT_TEXT.monitor;
      }
      const isNew = !!clueId && !(clueId in local.found);
      const at = local.found[clueId] ?? Date.now();
      update((l) => ({
        ...l,
        checked: l.checked.includes(spotId) ? l.checked : [...l.checked, spotId],
        found: clueId && !(clueId in l.found) ? { ...l.found, [clueId]: at } : l.found,
        spots: clueId && !(clueId in l.spots) ? { ...l.spots, [clueId]: spotId } : l.spots,
      }));
      const evidence = clueId ? clueEvidence(s, clueId, at, local.spots[clueId] ?? spotId) : null;
      return { evidence, isNew, text: evidence?.text ?? fillVictim(text ?? "특별한 건 없어 보인다.", s.victim) };
    },
    [local.found, local.spots, update],
  );

  const ask = useCallback<GameActions["ask"]>(async ({ suspectId, question, clueId }) => {
    const attach = clueId ? (clueId.startsWith("turn:") ? { type: "turn", id: clueId.slice(5) } : { type: "clue", id: clueId }) : undefined;
    // 서버는 빈 질문을 받지 않는다. 증거만 내밀면 짧은 말을 붙인다.
    const q = question.trim() || "이것 좀 보세요.";
    const fingerprint = JSON.stringify(["q", suspectId, q, clueId]);
    const body = { npc: suspectId, question: q, attach, requestId: requestId(fingerprint) };
    const r = await api<{ status: "accepted" | "clarify" | "rejected"; turn?: ServerTurn; message?: string; remaining: number; used?: number; thought?: string }>("/api/question", body);
    pending.current.delete(fingerprint);
    if (r.status !== "accepted" || !r.turn) {
      setSession((s) => s && { ...s, remaining: r.remaining });
      return { type: "notice", text: r.message ?? "다시 물어보자.", used: r.used };
    }
    const turn = r.turn;
    setSession((s) => s && { ...s, remaining: r.remaining, turns: s.turns.some((t) => t.id === turn.id) ? s.turns : [...s.turns, turn] });
    return { type: "answer", message: toMessage(turn, sessionRef.current?.turns.length ?? 0), used: r.used, thought: r.thought };
  }, []);

  const accuse = useCallback(
    async (a: Accusation) => {
      update((l) => ({ ...l, mine: a }));
      const fingerprint = JSON.stringify(["s", a.suspectId, a.motive]);
      const r = await api<{ result: ServerResult }>("/api/submit", { npc: a.suspectId, motive: a.motive, requestId: requestId(fingerprint) });
      pending.current.delete(fingerprint);
      setSession((s) => s && { ...s, result: r.result });
      return r.result.score === 1 ? "win" : "lose";
    },
    [update],
  );

  const reset = useCallback(async () => {
    const old = keyRef.current;
    // 서버가 새 게임을 만든 뒤에만 이전 메모를 지운다 (실패하면 지금 게임과 메모가 그대로 남는다).
    const next = await api<Session>("/api/reset", {});
    if (old) {
      try {
        localStorage.removeItem(old);
      } catch {
        /* 무시 */
      }
    }
    pending.current.clear();
    adopt(next);
  }, [adopt]);

  const pinNote = useCallback(
    (messageId: string, text: string) => {
      const m = sessionRef.current?.turns.find((t) => t.id === messageId);
      if (!m) return;
      update((l) => (l.notes.some((n) => n.messageId === messageId && n.text === text) ? l : { ...l, notes: [...l.notes, { id: uid(), suspectId: m.npc, messageId, text, createdAt: Date.now() }] }));
    },
    [update],
  );
  const unpinNote = useCallback((noteId: string) => update((l) => ({ ...l, notes: l.notes.filter((n) => n.id !== noteId) })), [update]);
  const addContradiction = useCallback(
    (a: string, b: string, memo: string) =>
      update((l) => (l.contradictions.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) ? l : { ...l, contradictions: [...l.contradictions, { id: uid(), a, b, memo }] })),
    [update],
  );
  const removeContradiction = useCallback((id: string) => update((l) => ({ ...l, contradictions: l.contradictions.filter((c) => c.id !== id) })), [update]);

  const actions = useMemo(
    () => ({ beginInvestigation, investigate, ask, pinNote, unpinNote, addContradiction, removeContradiction, accuse, reset }),
    [beginInvestigation, investigate, ask, pinNote, unpinNote, addContradiction, removeContradiction, accuse, reset],
  );
  return { view, error, retry: load, actions };
}
