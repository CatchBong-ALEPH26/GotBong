"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView, Hotspot, Message } from "@/lib/view/types";
import type { GameActions } from "@/lib/api/useGame";
import { Stage, type Hit } from "./Stage";
import { Hud } from "./Hud";
import { DialogBox, emptyDraft, type Dialog, type Draft } from "./DialogBox";
import { EvidenceBag } from "./EvidenceBag";
import { Notebook, PAGE_LOG, emptyAccuseDraft, type AccuseDraft } from "./Notebook";
import { Closeup } from "./Closeup";
import { GhostCutscene, IntroScreen } from "./IntroScreen";
import { ALL_FOUND_HINT, HINTS, HINT_ORDER, fillVictim } from "@/lib/scene/classroom";
import { play, setBgm } from "@/lib/audio/sound";

/** 새 단서 없이 이만큼 지나면 단서 표시가 반짝이고(살짝 권함), 더 지나면 혼잣말 힌트가 저절로 나온다. */
const HINT_GLOW_MS = 45_000;
const HINT_AUTO_MS = 100_000;
/** 아무것도 없는 곳을 연달아 이만큼 누르면 단서 표시가 반짝인다. */
const EMPTY_CLICKS_GLOW = 4;

type Overlay = null | { kind: "notebook" } | { kind: "bag" };

/**
 * D 형태 진행 화면: 픽셀 장면 + 레트로 대사창. 대사는 AI 서버가 만든다.
 * 사건 소개 → (유령 연출) → 장면. 물건을 누르면 조사하고, 컴퓨터·본체는 클로즈업이 열린다.
 * 사람을 누르면 그 사람이 가운데 서고 질문하거나 증거를 내민다. 최종 추리는 수첩에서 제출한다. 데스크톱 전용.
 */
export function GameScreen({ view, actions }: { view: GameView; actions: GameActions }) {
  const [sceneId, setSceneId] = useState(view.scenario.scenes[0].id);
  const scene = view.scenario.scenes.find((s) => s.id === sceneId)!;
  const [closeupId, setCloseupId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>({
    kind: "narrate",
    key: "intro",
    title: "교실",
    text: "수상한 곳을 눌러 조사하고, 사람을 눌러 질문하자. 모은 단서와 증언은 수첩(N)에 정리된다.",
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [nbPage, setNbPage] = useState(0);
  const [logSuspect, setLogSuspect] = useState(view.scenario.suspects[0].id);
  const [accuse, setAccuse] = useState<AccuseDraft>(emptyAccuseDraft);
  const [cutscene, setCutscene] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 막힘 감지: 마지막으로 새 단서를 찾은 시각, 연달아 헛짚은 횟수, 단서별로 보여 준 힌트 단계
  const [lastProgress, setLastProgress] = useState(() => Date.now());
  const [emptyClicks, setEmptyClicks] = useState(0);
  const [hintsShown, setHintsShown] = useState<Record<string, number>>({});
  const [autoHinted, setAutoHinted] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const done = view.me.submitted;
  const suspectOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)!;
  const closeup = closeupId ? view.scenario.closeups[closeupId] : null;

  // 사람과 대화하는 동안(질문 입력·생각 중·답변) 그 사람을 화면 가운데 크게 보여 준다.
  const talking = !done && !closeup && !!target && (dialog.kind === "edit" || dialog.kind === "thinking" || dialog.kind === "answer");
  const talker = target ? suspectOf(target) : null;
  const lastMsg = target ? [...view.messages].reverse().find((m) => m.suspectId === target) : undefined;
  const answerMsg = dialog.kind === "answer" ? view.messages.find((m) => m.id === dialog.messageId) : undefined;
  const talkEmotion = dialog.kind === "thinking" ? "neutral" : (answerMsg ?? lastMsg)?.emotion ?? "neutral";

  const say = useCallback((t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  const prompt = (text: string) => setDialog({ kind: "prompt", key: `${text}-${Date.now()}`, text });

  function look(spot: Hotspot) {
    const r = actions.investigate(spot.id);
    if (r.evidence && r.isNew) {
      play("found");
      setLastProgress(Date.now());
      setEmptyClicks(0);
    } else {
      play("tick");
      setEmptyClicks((n) => n + 1);
    }
    if (r.evidence) {
      setDialog({ kind: "narrate", key: `${spot.id}-${Date.now()}`, title: r.evidence.name, text: r.evidence.text, image: { src: r.evidence.icon, alt: r.evidence.name, item: true }, found: r.isNew ? "new" : "again" });
    } else {
      setDialog({ kind: "narrate", key: `${spot.id}-${Date.now()}`, title: spot.label, text: r.text });
    }
  }

  function onSpot(spot: Hotspot) {
    if (spot.closeup) {
      setTarget(null);
      play("open");
      setCloseupId(spot.closeup);
      setDialog({ kind: "narrate", key: `cu-${spot.id}-${Date.now()}`, title: spot.label, text: "가까이 들여다본다. 수상한 곳을 눌러 보자." });
      return;
    }
    look(spot);
  }

  function onHit(h: Hit) {
    if (done) return;
    if (h.type === "suspect") {
      setTarget(h.id);
      // 지금 고른 사람의 말은 그 사람에게 내밀 수 없다 (서버 규칙).
      if (draft.clueId && view.evidence.find((e) => e.id === draft.clueId)?.suspectId === h.id) setDraft((d) => ({ ...d, clueId: null }));
      return setDialog({ kind: "edit" });
    }
    if (h.type === "spot") return onSpot(h.spot);
    play("tick");
    setEmptyClicks((n) => n + 1);
    setDialog({ kind: "narrate", key: `empty-${Date.now()}`, title: "살펴보기", text: view.scenario.emptyText });
  }

  function moveTo(id: string) {
    if (id === sceneId) return;
    const next = view.scenario.scenes.find((s) => s.id === id)!;
    setSceneId(id);
    setCloseupId(null);
    if (target && !next.people.some((p) => p.suspectId === target)) setTarget(null);
    setDialog({ kind: "narrate", key: `move-${id}-${Date.now()}`, title: next.name, text: `${next.name}에 왔다.` });
  }

  function openLog(suspectId: string) {
    setLogSuspect(suspectId);
    setNbPage(PAGE_LOG);
    setOverlay({ kind: "notebook" });
  }

  /** 증거를 고르면 질문에 붙인다. 대상이 없거나 그 사람 본인의 말이면 사람을 고르게 한다. */
  function present(id: string) {
    const own = view.evidence.find((e) => e.id === id)?.suspectId;
    setDraft((d) => ({ ...d, clueId: id }));
    setOverlay(null);
    setCloseupId(null);
    if (target && target !== own) setDialog({ kind: "edit" });
    else {
      if (target === own) setTarget(null);
      prompt(own ? "누구에게 이 말을 들이밀까? 말한 사람이 아닌 다른 사람을 눌러 줘." : "누구에게 이 증거를 내밀까? 장면에서 사람을 눌러 줘.");
    }
  }

  async function ask() {
    if (!target) return;
    const q = draft;
    play("send");
    setDialog({ kind: "thinking", since: Date.now() });
    try {
      const r = await actions.ask({ suspectId: target, question: q.question.trim(), clueId: q.clueId });
      if (r.type === "notice") {
        play("notice");
        setDialog({ kind: "notice", key: `notice-${Date.now()}`, text: r.text });
        return;
      }
      setDraft(emptyDraft);
      if (r.message.emotion === "flustered") play("fluster");
      setDialog({ kind: "answer", messageId: r.message.id, animate: true });
    } catch (e) {
      play("notice");
      setDialog({ kind: "notice", key: `err-${Date.now()}`, text: `${(e as Error).message} 질문은 차감되지 않았다. 같은 내용으로 다시 물을 수 있다.` });
    }
  }

  /** 아직 못 찾은 단서 하나에 대해 혼잣말 힌트를 준다. 같은 단서를 다시 물으면 더 구체적으로 말한다. */
  const missing = HINT_ORDER.find((id) => view.clues.some((c) => c.id === id && !c.found)) ?? null;
  function hint() {
    setEmptyClicks(0);
    setLastProgress(Date.now());
    if (!missing) return setDialog({ kind: "narrate", key: `hint-${Date.now()}`, title: "생각", text: ALL_FOUND_HINT, hint: true });
    const level = Math.min(hintsShown[missing] ?? 0, 1);
    setHintsShown((h) => ({ ...h, [missing]: (h[missing] ?? 0) + 1 }));
    setDialog({ kind: "narrate", key: `hint-${Date.now()}`, title: "생각", text: fillVictim(HINTS[missing][level], view.scenario.victim), hint: true });
  }
  const idle = !done && !overlay && !closeup && !cutscene && (dialog.kind === "narrate" || dialog.kind === "prompt");
  const stuckMs = tick - lastProgress;
  const hintReady = !!missing && (stuckMs > HINT_GLOW_MS || emptyClicks >= EMPTY_CLICKS_GLOW);

  // 5초마다 막힘 여부를 다시 본다. 오래 막혀 있으면 단서마다 한 번씩 흐릿한 힌트를 저절로 말한다.
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const autoHintDue = view.me.started && idle && !!missing && autoHinted !== missing && stuckMs > HINT_AUTO_MS && !(hintsShown[missing] > 0);
  useEffect(() => {
    if (!autoHintDue) return;
    setAutoHinted(missing);
    hint();
    // 조건이 참으로 바뀌는 순간 한 번만 말한다. hint·missing은 그 순간의 값을 쓰면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHintDue]);

  // 표정이 바뀔 때 깜빡이지 않게 상반신·초상 그림을 미리 받아 둔다.
  useEffect(() => {
    for (const s of view.scenario.suspects) for (const src of [...Object.values(s.sprites), ...Object.values(s.portraits)]) new Image().src = src;
  }, [view.scenario.suspects]);

  // 배경음은 수사 중에만 (소리를 켰을 때).
  useEffect(() => {
    setBgm(view.me.started && !done);
    return () => setBgm(false);
  }, [view.me.started, done]);

  function pin(m: Message, s: string) {
    actions.pinNote(m.id, s);
    say("✎ 밑줄을 쳐 두었다");
  }

  // 단축키: N 수첩, Esc 클로즈업 닫기. 입력 중이거나 창이 열려 있으면 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]:not(.closeup)") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "n") {
        play("open");
        setOverlay({ kind: "notebook" });
      }
      if (e.key === "Escape") setCloseupId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!view.me.started) {
    return (
      <IntroScreen
        view={view}
        onStart={() => {
          play("open");
          setLastProgress(Date.now());
          actions.beginInvestigation();
          setCutscene(true);
        }}
      />
    );
  }

  return (
    <div className={`game ${done ? "is-done" : ""} ${talking ? "is-talking" : ""}`}>
      <div className="desktop-only px" role="alert">
        <p>방과후 탐정단은 데스크톱 화면에서 플레이한다.</p>
        <p className="dim">창을 넓히거나 컴퓨터로 접속해 줘.</p>
      </div>
      <div className="stage-frame">
        <Hud
          view={view}
          sceneId={sceneId}
          onMove={moveTo}
          onNotebook={() => {
            play("open");
            setOverlay({ kind: "notebook" });
          }}
          onHint={() => {
            setCloseupId(null);
            setTarget(null);
            hint();
          }}
          hintReady={hintReady && idle}
        />
        <Stage view={view} scene={scene} target={target} disabled={done} onHit={onHit} />
        {closeup && <Closeup view={view} data={closeup} onSpot={onSpot} onOpen={setCloseupId} onClose={() => setCloseupId(null)} />}
        {talking && talker && (
          <figure key={talker.id} className={`talk-figure ${dialog.kind === "thinking" ? "is-thinking" : ""}`} aria-label={`${talker.name} · 대화 중`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 픽셀 스프라이트 원본 그대로 */}
            <img key={talkEmotion} src={talker.sprites[talkEmotion]} alt={`${talker.name}의 표정`} draggable={false} className={talkEmotion === "flustered" && dialog.kind === "answer" ? "shake" : ""} />
          </figure>
        )}
        {toast && <div className="toast px" role="status">{toast}</div>}
        <div className="bottom">
          <DialogBox
            view={view}
            dialog={dialog}
            target={target}
            draft={draft}
            setDraft={setDraft}
            onAsk={ask}
            onCancel={() => prompt("질문을 접었다. 써 둔 내용은 남아 있다.")}
            onOpenBag={() => setOverlay({ kind: "bag" })}
            onAskAgain={() => setDialog({ kind: "edit" })}
            onBacklog={openLog}
            onPin={pin}
          />
        </div>
        {cutscene && <GhostCutscene onDone={() => setCutscene(false)} />}
      </div>

      {overlay?.kind === "bag" && <EvidenceBag view={view} target={target} selectedId={draft.clueId} onUse={present} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "notebook" && (
        <Notebook
          view={view}
          actions={actions}
          page={nbPage}
          setPage={setNbPage}
          accuse={accuse}
          setAccuse={setAccuse}
          logSuspect={logSuspect}
          setLogSuspect={setLogSuspect}
          onPin={pin}
          onPresent={present}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
