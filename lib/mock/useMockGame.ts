"use client";

// 서버 없이 화면 흐름을 확인하기 위한 가짜 게임 상태 (유령 키보드 예시).
// 나중에 API 호출 + 2초 폴링으로 교체한다. 화면 컴포넌트는 GameActions 인터페이스만 쓴다.
import { useCallback, useRef, useState } from "react";
import type { Accusation, Contradiction, Evidence, GameView, Message, RoomStatus } from "@/lib/view/types";
import { CLUES, SPOT_TEXT, SPOT_TO_CLUE, TESTIMONY, TESTS, buildReport, ghostScenario, initialServerState, mockServer, type ServerState } from "./ghostKeyboard";

export type InvestigateResult = { evidence: Evidence | null; isNew: boolean; text: string; label: string };
export type KeyboardTestResult = { evidence: Evidence; typedOn: "self" | "b"; line?: string; charged: boolean };

export type GameActions = {
  start: () => Promise<void>;
  beginInvestigation: () => Promise<void>;
  investigate: (spotId: string, label: string) => Promise<InvestigateResult>;
  ask: (input: { suspectId: string; question: string; clueId: string | null }) => Promise<Message>;
  keyboardTest: (suspectId: string) => Promise<KeyboardTestResult>;
  pinNote: (messageId: string, text: string) => void;
  unpinNote: (noteId: string) => void;
  addContradiction: (a: string, b: string, memo: string) => void;
  removeContradiction: (id: string) => void;
  accuse: (a: Accusation) => Promise<void>;
  debugSetStatus: (s: RoomStatus) => void;
};

const config = { generalQuestions: 20, totalMs: 20 * 60_000, graceMs: 30_000, questionMaxLength: 100 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);

function initial(code: string): GameView {
  return {
    code,
    status: "waiting",
    endsAt: null,
    config,
    scenario: ghostScenario,
    players: [
      { nickname: "나", questionsUsed: 0, submitted: false, isMe: true },
      { nickname: "탐정토끼", questionsUsed: 3, submitted: false, isMe: false },
      { nickname: "셜록킴", questionsUsed: 5, submitted: false, isMe: false },
    ],
    me: { nickname: "나", isHost: true, questionsUsed: 0, started: false, submitted: false },
    checked: [],
    evidence: [],
    testsDone: [],
    messages: [],
    notes: [],
    contradictions: [],
    myAccusation: undefined,
    report: null,
  };
}

const make = (id: string, d: Omit<Evidence, "id" | "foundAt">): Evidence => ({ id, ...d, foundAt: Date.now() });

export function useMockGame(code: string): { view: GameView; actions: GameActions } {
  const [view, setView] = useState<GameView>(() => initial(code));
  const viewRef = useRef(view);
  viewRef.current = view;
  const server = useRef<ServerState>(initialServerState());

  const start = useCallback(async () => {
    await wait(300);
    setView((v) => ({ ...v, status: "playing" }));
  }, []);

  /** 사건 소개 화면에서 "수사 시작". 이때부터 20분을 잰다 (실제로는 서버가 시작 시각을 기록). */
  const beginInvestigation = useCallback(async () => {
    await wait(150);
    setView((v) => ({ ...v, me: { ...v.me, started: true }, endsAt: Date.now() + v.config.totalMs }));
  }, []);

  const investigate = useCallback(async (spotId: string, label: string): Promise<InvestigateResult> => {
    await wait(120);
    const clueId = SPOT_TO_CLUE[spotId];
    const def = clueId ? CLUES[clueId] : undefined;
    const had = !!clueId && viewRef.current.evidence.some((e) => e.id === clueId);
    const ev = def ? make(clueId!, def) : null;
    setView((v) => ({
      ...v,
      checked: v.checked.includes(spotId) ? v.checked : [...v.checked, spotId],
      evidence: ev && !v.evidence.some((e) => e.id === ev.id) ? [...v.evidence, ev] : v.evidence,
    }));
    return { evidence: ev, isNew: !!ev && !had, text: ev ? ev.text : (SPOT_TEXT[spotId] ?? ghostScenario.emptyText), label };
  }, []);

  const ask = useCallback<GameActions["ask"]>(async ({ suspectId, question, clueId }) => {
    await wait(900);
    const r = mockServer(server.current, suspectId, question, clueId);
    const added = r.add.map((id) => make(id, TESTIMONY[id]));
    const msg: Message = {
      id: uid(),
      suspectId,
      question,
      clueId,
      answer: r.answer,
      emotion: r.emotion,
      charged: r.charged,
      notice: r.notice,
      newEvidenceIds: added.map((e) => e.id),
      createdAt: Date.now(),
    };
    setView((v) => {
      const used = v.me.questionsUsed + (r.charged ? 1 : 0);
      return {
        ...v,
        me: { ...v.me, questionsUsed: used },
        messages: [...v.messages, msg],
        evidence: [...v.evidence, ...added.filter((e) => !v.evidence.some((x) => x.id === e.id))],
        players: v.players.map((p) => (p.isMe ? { ...p, questionsUsed: used } : p)),
      };
    });
    return msg;
  }, []);

  const keyboardTest = useCallback(async (suspectId: string): Promise<KeyboardTestResult> => {
    await wait(200);
    const t = TESTS[suspectId];
    const again = viewRef.current.testsDone.includes(suspectId);
    const ev = make(`test-${suspectId}`, t);
    setView((v) => {
      const used = v.me.questionsUsed + (again ? 0 : 1);
      return {
        ...v,
        me: { ...v.me, questionsUsed: used },
        testsDone: again ? v.testsDone : [...v.testsDone, suspectId],
        evidence: v.evidence.some((e) => e.id === ev.id) ? v.evidence : [...v.evidence, ev],
        players: v.players.map((p) => (p.isMe ? { ...p, questionsUsed: used } : p)),
      };
    });
    return { evidence: ev, typedOn: t.typedOn, line: t.line, charged: !again };
  }, []);

  const pinNote = useCallback((messageId: string, text: string) => {
    setView((v) => {
      if (v.notes.some((n) => n.messageId === messageId && n.text === text)) return v;
      const m = v.messages.find((x) => x.id === messageId);
      if (!m) return v;
      return { ...v, notes: [...v.notes, { id: uid(), suspectId: m.suspectId, messageId, text, createdAt: Date.now() }] };
    });
  }, []);

  const unpinNote = useCallback((noteId: string) => {
    setView((v) => ({ ...v, notes: v.notes.filter((n) => n.id !== noteId) }));
  }, []);

  const addContradiction = useCallback((a: string, b: string, memo: string) => {
    setView((v) => {
      if (v.contradictions.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))) return v;
      const c: Contradiction = { id: uid(), a, b, memo };
      return { ...v, contradictions: [...v.contradictions, c] };
    });
  }, []);

  const removeContradiction = useCallback((id: string) => {
    setView((v) => ({ ...v, contradictions: v.contradictions.filter((c) => c.id !== id) }));
  }, []);

  /** 제출 (null이면 시간 초과 미제출). 예시에서는 다른 탐정이 이미 끝났다고 보고 곧바로 결과로 넘어간다. */
  const accuse = useCallback(async (a: Accusation) => {
    await wait(400);
    setView((v) => ({ ...v, myAccusation: a, me: { ...v.me, submitted: true }, players: v.players.map((p) => (p.isMe ? { ...p, submitted: true } : p)) }));
    await wait(1500);
    setView((v) => finish(v, a));
  }, []);

  const debugSetStatus = useCallback((s: RoomStatus) => {
    setView((v) => (s === "finished" ? finish(v, v.myAccusation ?? { suspectId: "d", motiveId: "m1" }) : { ...v, status: s }));
  }, []);

  return {
    view,
    actions: { start, beginInvestigation, investigate, ask, keyboardTest, pinNote, unpinNote, addContradiction, removeContradiction, accuse, debugSetStatus },
  };
}

function finish(v: GameView, a: Accusation): GameView {
  return {
    ...v,
    status: "finished",
    report: buildReport({
      culprit: a?.suspectId ?? null,
      motive: a?.motiveId ?? null,
      evidenceIds: v.evidence.map((e) => e.id),
      shown: [...new Set(v.messages.filter((m) => m.clueId).map((m) => v.evidence.find((e) => e.id === m.clueId)?.name ?? ""))].filter(Boolean),
      questionsUsed: v.me.questionsUsed,
      timeLeftMs: Math.max(0, (v.endsAt ?? Date.now()) - Date.now()),
      others: [
        { nickname: "탐정토끼", verdict: "win", questionsUsed: 9 },
        { nickname: "셜록킴", verdict: "lose", questionsUsed: 6 },
      ],
    }),
  };
}
