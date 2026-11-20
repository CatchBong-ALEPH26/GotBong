"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView, Hotspot, Message } from "@/lib/view/types";
import type { GameActions, KeyboardTestResult } from "@/lib/mock/useMockGame";
import { keyboardTestOpen } from "@/lib/view/rules";
import { useNow } from "@/lib/view/useNow";
import { Stage, type Hit } from "./Stage";
import { Hud } from "./Hud";
import { DialogBox, emptyDraft, type Dialog, type Draft } from "./DialogBox";
import { EvidenceBag } from "./EvidenceBag";
import { Notebook, PAGE_LOG, emptyAccuseDraft, type AccuseDraft } from "./Notebook";
import { Closeup } from "./Closeup";
import { KeyboardTest } from "./KeyboardTest";
import { GhostCutscene, IntroScreen } from "./IntroScreen";

type Overlay = null | { kind: "notebook" } | { kind: "bag" } | { kind: "kbtest"; preset: string | null };

/**
 * D 형태 진행 화면: 픽셀 장면 + 레트로 대사창 (기준: 유령 키보드 규칙 v2).
 * 사건 소개 → (유령 연출) → 장면. 물건을 누르면 조사하고, 컴퓨터·본체는 클로즈업이 열린다.
 * 사람을 누르면 그 사람이 가운데 서고 질문하거나 증거를 내민다.
 * 시간이 끝나면 수첩의 최종 추리 쪽이 열리고 30초 안에 제출해야 한다. 데스크톱 전용.
 */
export function GameScreen({ view, actions }: { view: GameView; actions: GameActions }) {
  const now = useNow(250);
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
  const timedOut = useRef(false);
  const done = view.me.submitted;
  const suspectOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)!;
  const closeup = closeupId ? view.scenario.closeups[closeupId] : null;

  // 시간 종료 → 제출 유예 30초 → 미제출이면 패배 (규칙 v2 3장)
  const timeUp = !!view.endsAt && now >= view.endsAt && !done;
  const graceLeft = view.endsAt ? view.endsAt + view.config.graceMs - now : 0;
  useEffect(() => {
    if (timeUp && graceLeft <= 0 && !timedOut.current) {
      timedOut.current = true;
      actions.accuse(null);
    }
  }, [timeUp, graceLeft, actions]);

  // 사람과 대화하는 동안(질문 입력·생각 중·답변) 그 사람을 화면 가운데 크게 보여 준다.
  const talking = !done && !timeUp && !closeup && !!target && (dialog.kind === "edit" || dialog.kind === "thinking" || dialog.kind === "answer");
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

  async function look(spot: Hotspot) {
    const r = await actions.investigate(spot.id, spot.label);
    if (r.evidence) {
      setDialog({ kind: "narrate", key: `${spot.id}-${Date.now()}`, title: r.evidence.name, text: r.evidence.text, image: { src: r.evidence.icon, alt: r.evidence.name, item: true }, found: r.isNew ? "new" : "again" });
    } else {
      setDialog({ kind: "narrate", key: `${spot.id}-${Date.now()}`, title: spot.label, text: r.text });
    }
  }

  function onSpot(spot: Hotspot) {
    if (spot.closeup) {
      setTarget(null);
      setCloseupId(spot.closeup);
      setDialog({ kind: "narrate", key: `cu-${spot.id}-${Date.now()}`, title: spot.label, text: "가까이 들여다본다. 수상한 곳을 눌러 보자." });
      return;
    }
    if (spot.action === "keyboard-test" && keyboardTestOpen(view)) {
      setOverlay({ kind: "kbtest", preset: spot.keyboardOf ?? null });
      return;
    }
    look(spot);
  }

  function onHit(h: Hit) {
    if (done) return;
    if (h.type === "suspect") {
      setTarget(h.id);
      return setDialog({ kind: "edit" });
    }
    if (h.type === "spot") return onSpot(h.spot);
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

  /** 증거를 고르면 질문에 붙인다. 대상이 없으면 사람을 고르게 한다. */
  function present(id: string) {
    setDraft((d) => ({ ...d, clueId: id }));
    setOverlay(null);
    setCloseupId(null);
    if (target) setDialog({ kind: "edit" });
    else prompt("누구에게 이 증거를 내밀까? 장면에서 사람을 눌러 줘.");
  }

  async function ask() {
    if (!target) return;
    const q = draft;
    setDialog({ kind: "thinking" });
    try {
      const m = await actions.ask({ suspectId: target, question: q.question.trim(), clueId: q.clueId });
      setDraft(emptyDraft);
      setDialog({ kind: "answer", messageId: m.id, animate: true });
    } catch {
      setDialog({ kind: "narrate", key: `err-${Date.now()}`, title: "알림", text: "대답을 받지 못했다. 질문은 차감되지 않았다. 다시 시도해 줘." });
    }
  }

  function afterTest(r: KeyboardTestResult) {
    setOverlay(null);
    setDialog({ kind: "narrate", key: `kb-${r.evidence.id}-${Date.now()}`, title: r.evidence.name, text: r.evidence.text, image: { src: r.evidence.icon, alt: "", item: true }, found: "new" });
  }

  function pin(m: Message, s: string) {
    actions.pinNote(m.id, s);
    say("✎ 밑줄을 쳐 두었다");
  }

  // 단축키: N 수첩, Esc 클로즈업 닫기. 입력 중이거나 창이 열려 있으면 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]:not(.closeup)") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "n") setOverlay({ kind: "notebook" });
      if (e.key === "Escape") setCloseupId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (done) setDialog({ kind: "narrate", key: "submitted", title: "제출 완료", text: "추리를 제출했다. 결과를 기다리는 중…" });
  }, [done]);

  if (!view.me.started) {
    return (
      <IntroScreen
        view={view}
        onStart={async () => {
          await actions.beginInvestigation();
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
        <Hud view={view} now={now} sceneId={sceneId} onMove={moveTo} onNotebook={() => setOverlay({ kind: "notebook" })} />
        <Stage view={view} scene={scene} target={target} disabled={done} onHit={onHit} />
        {closeup && <Closeup view={view} data={closeup} onSpot={onSpot} onOpen={setCloseupId} onClose={() => setCloseupId(null)} />}
        {overlay?.kind === "kbtest" && <KeyboardTest view={view} actions={actions} preset={overlay.preset} onDone={afterTest} onClose={() => setOverlay(null)} />}
        {talking && talker && (
          <figure key={talker.id} className="talk-figure" aria-label={`${talker.name}와 대화 중`}>
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

      {overlay?.kind === "bag" && <EvidenceBag view={view} selectedId={draft.clueId} onUse={present} onClose={() => setOverlay(null)} />}
      {(overlay?.kind === "notebook" || timeUp) && (
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
          overtimeLeftMs={timeUp ? Math.max(0, graceLeft) : undefined}
        />
      )}
    </div>
  );
}
