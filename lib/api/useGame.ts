"use client";

// AI 서버(ai-server/ai-server)에 붙는 게임 상태. 명세: ai-server/ai-server/docs/HANDOFF.md §3, 연결 안내: docs/INTEGRATION.md
// 서버가 아는 것: 사건 소개, 단서 카드 5장, 용의자, 대화 기록, 남은 질문, 결과.
// 화면만 아는 것(이 브라우저의 localStorage): 수사 시작 여부, 장면에서 찾은 단서, 밑줄 메모, 연필 선, 내가 낸 답.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Accusation, Contradiction, Emotion, Evidence, GameView, Message, Note, PublicScenario } from "@/lib/view/types";
import { CLUE_META, RULES, SPOT_TEXT, SPOT_TO_CLUE, SUGGESTIONS, TESTIMONY_ICON, art, classroom, closeups, fillVictim } from "@/lib/scene/classroom";

// ---------- 서버 응답 형태 (HANDOFF.md §3) ----------
type ServerAttach = { type: "clue"; id: string; title: string } | { type: "turn"; id: string; npc: string; reply: string } | null;
type ServerTurn = { id: string; npc: string; question: string; reply: string; emotion: string; attach: ServerAttach };
type ServerResult = { score: 0 | 1; truth: string; cast: { npc: string; name: string; role: string; title: string }[] };
export type Session = {
  intro: string;
  victim: string;
  clues: { id: string; title: string; detail: string }[];
  npcs: { id: string; name: string; summary: string }[];
  mode: GameView["mode"];
  remaining: number;
  maxQuestions: number;
  turns: ServerTurn[];
  result: ServerResult | null;
};

type Local = {
  started: boolean;
  found: Record<string, number>; // 단서 id → 찾은 시각
  checked: string[];
  notes: Note[];
  contradictions: Contradiction[];
  mine: Accusation | null;
};
const emptyLocal: Local = { started: false, found: {}, checked: [], notes: [], contradictions: [], mine: null };

export type InvestigateResult = { evidence: Evidence | null; isNew: boolean; text: string };
export type AskResult = { type: "answer"; message: Message } | { type: "notice"; text: string };

export type GameActions = {
  beginInvestigation: () => void;
  investigate: (spotId: string) => InvestigateResult;
  ask: (input: { suspectId: string; question: string; clueId: string | null }) => Promise<AskResult>;
  pinNote: (messageId: string, text: string) => void;
  unpinNote: (noteId: string) => void;
  addContradiction: (a: string, b: string, memo: string) => void;
  removeContradiction: (id: string) => void;
  accuse: (a: Accusation) => Promise<void>;
  reset: () => Promise<void>;
};

/** 화면에 보여 줄 수 있는 오류 (서버의 error 문장 그대로). */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "서버에 연결하지 못했다. AI 서버가 켜져 있는지 확인해 줘.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? (res.status >= 500 ? "AI 서버에 연결하지 못했다. AI 서버가 켜져 있는지 확인해 줘." : "요청을 처리하지 못했다."));
  return data as T;
}

const EMOTION: Record<string, Emotion> = { 기본: "neutral", 당황: "flustered", 화남: "angry", 웃음: "smile" };
const uid = () => crypto.randomUUID();
const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n) + "…" : s);
/** 게임마다 피해자와 범인이 바뀐다. 이 둘로 이 브라우저의 메모 저장 칸을 나눈다. */
const storageKey = (s: Session) => `gotbong:${s.victim}:${s.clues.find((c) => c.id === "build")?.title ?? ""}`;

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

function clueEvidence(s: Session, id: string, foundAt: number): Evidence | null {
  const c = s.clues.find((x) => x.id === id);
  if (!c) return null;
  const meta = CLUE_META[id] ?? { icon: TESTIMONY_ICON, place: "", order: null };
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
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const adopt = useCallback((s: Session) => {
    keyRef.current = storageKey(s);
    setLocal(loadLocal(keyRef.current));
    setSession(s);
  }, []);

  const load = useCallback(() => {
    setError(null);
    api<Session>("/api/session").then(adopt, (e: Error) => setError(e.message));
  }, [adopt]);

  useEffect(load, [load]);

  const update = useCallback((f: (l: Local) => Local) => {
    setLocal((l) => {
      const next = f(l);
      if (keyRef.current) localStorage.setItem(keyRef.current, JSON.stringify(next));
      return next;
    });
  }, []);

  const requestId = (fingerprint: string) => {
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: uid() };
    return pending.current.requestId;
  };

  const view = useMemo<GameView | null>(() => {
    if (!session) return null;
    const scenario = buildScenario(session);
    const nameOf = (id: string) => session.npcs.find((n) => n.id === id)?.name ?? "";
    const messages = session.turns.map(toMessage);
    const clues = Object.entries(local.found).flatMap(([id, at]) => clueEvidence(session, id, at) ?? []);
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
      evidence,
      messages,
      notes: local.notes,
      contradictions: local.contradictions,
      report: r
        ? {
            verdict: r.score === 1 ? "win" : "lose",
            mine: { culprit: nameOf(local.mine?.suspectId ?? ""), motive: local.mine?.motive ?? "" },
            truth: r.truth,
            cast: r.cast.map((c) => ({ name: c.name, title: c.title })),
            usage: {
              questionsUsed: session.maxQuestions - session.remaining,
              evidenceFound: clues.length,
              evidenceShown: [...new Set(messages.flatMap((m) => (m.clueId ? [evidence.find((e) => e.id === m.clueId)?.name ?? ""] : [])))].filter(Boolean),
            },
          }
        : null,
    };
  }, [session, local]);

  const beginInvestigation = useCallback(() => update((l) => ({ ...l, started: true })), [update]);

  const investigate = useCallback(
    (spotId: string): InvestigateResult => {
      const s = sessionRef.current!;
      let clueId = SPOT_TO_CLUE[spotId];
      let text = SPOT_TEXT[spotId];
      if (spotId.startsWith("monitor-")) {
        // 빌드 기록은 단서 제목에 이름이 적힌 사람의 모니터에서 나온다.
        const owner = s.npcs.find((n) => n.id === spotId.slice("monitor-".length));
        const build = s.clues.find((c) => c.id === "build");
        if (owner && build?.title.startsWith(owner.name)) clueId = "build";
        else text = SPOT_TEXT.monitor;
      }
      const isNew = !!clueId && !(clueId in local.found);
      const at = local.found[clueId] ?? Date.now();
      update((l) => ({
        ...l,
        checked: l.checked.includes(spotId) ? l.checked : [...l.checked, spotId],
        found: clueId && !(clueId in l.found) ? { ...l.found, [clueId]: at } : l.found,
      }));
      const evidence = clueId ? clueEvidence(s, clueId, at) : null;
      return { evidence, isNew, text: evidence?.text ?? fillVictim(text ?? "특별한 건 없어 보인다.", s.victim) };
    },
    [local.found, update],
  );

  const ask = useCallback<GameActions["ask"]>(async ({ suspectId, question, clueId }) => {
    const attach = clueId ? (clueId.startsWith("turn:") ? { type: "turn", id: clueId.slice(5) } : { type: "clue", id: clueId }) : undefined;
    // 서버는 빈 질문을 받지 않는다. 증거만 내밀면 짧은 말을 붙인다.
    const q = question.trim() || "이것 좀 보세요.";
    const body = { npc: suspectId, question: q, attach, requestId: requestId(JSON.stringify(["q", suspectId, q, clueId])) };
    const r = await api<{ status: "accepted" | "clarify" | "rejected"; turn?: ServerTurn; message?: string; remaining: number }>("/api/question", body);
    pending.current = null;
    if (r.status !== "accepted" || !r.turn) {
      setSession((s) => s && { ...s, remaining: r.remaining });
      return { type: "notice", text: r.message ?? "다시 물어봐 줘." };
    }
    const turn = r.turn;
    setSession((s) => s && { ...s, remaining: r.remaining, turns: s.turns.some((t) => t.id === turn.id) ? s.turns : [...s.turns, turn] });
    return { type: "answer", message: toMessage(turn, sessionRef.current?.turns.length ?? 0) };
  }, []);

  const accuse = useCallback(
    async (a: Accusation) => {
      update((l) => ({ ...l, mine: a }));
      const r = await api<{ result: ServerResult }>("/api/submit", { npc: a.suspectId, motive: a.motive, requestId: requestId(JSON.stringify(["s", a.suspectId, a.motive])) });
      pending.current = null;
      setSession((s) => s && { ...s, result: r.result });
    },
    [update],
  );

  const reset = useCallback(async () => {
    if (keyRef.current) localStorage.removeItem(keyRef.current);
    adopt(await api<Session>("/api/reset", {}));
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
