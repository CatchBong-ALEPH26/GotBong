"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView, Hotspot, Message } from "@/lib/view/types";
import { ApiError, type GameActions } from "@/lib/api/useGame";
import { Stage, type Hit } from "./Stage";
import { Hud } from "./Hud";
import { DialogBox, emptyDraft, type Dialog, type Draft } from "./DialogBox";
import { EvidenceBag } from "./EvidenceBag";
import { Notebook, PAGE_LOG, emptyAccuseDraft, type AccuseDraft } from "./Notebook";
import { Closeup, ClueView } from "./Closeup";
import { ClueCard } from "./ClueCard";
import { IntroScreen } from "./IntroScreen";
import { ALL_FOUND_HINT, HINTS, HINT_ORDER, fillVictim, TEACHER } from "@/lib/scene/classroom";
import { play, setBgm } from "@/lib/audio/sound";

/** 새 단서 없이 이만큼 지나면 단서 표시가 반짝이고(살짝 권함), 더 지나면 혼잣말 힌트가 저절로 나온다. */
const HINT_GLOW_MS = 45_000;
const HINT_AUTO_MS = 100_000;
/** 아무것도 없는 곳을 연달아 이만큼 누르면 단서 표시가 반짝인다. */
const EMPTY_CLICKS_GLOW = 4;

type Overlay = null | { kind: "notebook" } | { kind: "bag" };

/**
 * D 형태 진행 화면: 픽셀 장면 + 레트로 대사창. 대사는 AI 서버가 만든다.
 * 시작 영상 → 장면. 물건을 누르면 조사하고, 강사님 모니터는 클로즈업이 열린다. 찾은 단서는 실제 물건 모양으로 크게 보여 준다.
 * 사람을 누르면 그 사람이 가운데 서고 질문하거나 증거를 내민다. 최종 추리는 수첩에서 제출한다. 데스크톱 전용.
 */
export function GameScreen({ view, actions }: { view: GameView; actions: GameActions }) {
  const [sceneId, setSceneId] = useState(view.scenario.scenes[0].id);
  const scene = view.scenario.scenes.find((s) => s.id === sceneId)!;
  const [closeupId, setCloseupId] = useState<string | null>(null);
  // 장면에서 바로 찾은 단서(종이, 실물)를 크게 보여 주는 중이면 그 단서 id
  const [cardId, setCardId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>({
    kind: "narrate",
    key: "intro",
    title: "강의실",
    text: "수상한 곳을 눌러 조사하고, 사람을 눌러 질문하자. 모은 단서와 증언은 수첩(N)에 정리된다.",
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [nbPage, setNbPage] = useState(0);
  const [logSuspect, setLogSuspect] = useState(view.scenario.suspects[0].id);
  const [accuse, setAccuse] = useState<AccuseDraft>(emptyAccuseDraft);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 막힘 감지: 마지막으로 새 단서를 찾은 시각, 연달아 헛짚은 횟수, 단서별로 보여 준 힌트 단계
  const [lastProgress, setLastProgress] = useState(() => Date.now());
  const [emptyClicks, setEmptyClicks] = useState(0);
  const [teacherTalks, setTeacherTalks] = useState(0);
  const [hintsShown, setHintsShown] = useState<Record<string, number>>({});
  const [autoHinted, setAutoHinted] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const done = view.me.submitted;
  // 답변을 기다리는 동안에는 장면·힌트·이동·증거를 막는다 (다른 사람 이름으로 답이 뜨거나 요청이 겹치지 않게).
  const busy = dialog.kind === "thinking";
  const suspectOf = (id: string) => view.scenario.suspects.find((s) => s.id === id)!;
  const closeup = closeupId ? view.scenario.closeups[closeupId] : null;
  const card = cardId ? view.evidence.find((e) => e.id === cardId) ?? null : null;

  // 사람과 대화하는 동안(질문 입력·생각 중·답변) 그 사람을 화면 가운데 크게 보여 준다.
  const talking = !done && !closeup && !card && !!target && (dialog.kind === "edit" || dialog.kind === "thinking" || dialog.kind === "answer");
  const talker = target ? suspectOf(target) : null;
  // 강사님처럼 말만 하는 인물: 관찰문 대사창에 큰 그림을 함께 띄운다 (용의자 대화와 같은 모양).
  const npcFigure = !done && !closeup && !card && dialog.kind === "narrate" ? dialog.figure : undefined;
  const lastMsg = target ? [...view.messages].reverse().find((m) => m.suspectId === target) : undefined;
  const answerMsg = dialog.kind === "answer" ? view.messages.find((m) => m.id === dialog.messageId) : undefined;
  // 방금 받은 답변에 자료나 새 단서 카드가 딸려 왔으면 대사창 위에 물건 모양으로 띄운다.
  const gainedClue = answerMsg?.gainedClueId ? view.evidence.find((e) => e.id === answerMsg.gainedClueId) : undefined;
  const gain = gainedClue
    ? { label: "새 단서 · 수첩에 적었다", form: gainedClue.form ?? "paper", title: gainedClue.name, text: gainedClue.text }
    : answerMsg?.material
      ? { label: "보여 준 자료 · 대화 기록에 남는다", form: answerMsg.material.form, title: answerMsg.material.title, text: answerMsg.material.text }
      : null;
  const talkEmotion = dialog.kind === "thinking" ? "neutral" : (answerMsg ?? lastMsg)?.emotion ?? "neutral";

  const say = useCallback((t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  const prompt = (text: string) => setDialog({ kind: "prompt", key: `${text}-${Date.now()}`, text });

  async function look(spot: Hotspot) {
    let r;
    try {
      r = await actions.investigate(spot.id);
    } catch (e) {
      play("notice");
      setDialog({ kind: "notice", key: `look-${Date.now()}`, text: `${(e as Error).message} 다시 눌러 조사해 보자.` });
      return;
    }
    if (r.evidence && r.isNew) {
      play("found");
      setLastProgress(Date.now());
      setEmptyClicks(0);
    } else if (r.evidence) {
      // 이미 찾은 단서를 다시 읽는 것은 헛짚은 게 아니다.
      play("open");
    } else {
      play("tick");
      setEmptyClicks((n) => n + 1);
    }
    if (r.evidence) {
      // 모니터 속 단서는 그 화면의 창으로 뜬다. 장면에서 바로 찾은 단서는 물건 모양으로 크게 보여 준다.
      if (!closeupId) {
        setTarget(null);
        setCardId(r.evidence.id);
      }
      setDialog({ kind: "narrate", key: `${spot.id}-${Date.now()}`, title: r.evidence.name, text: "자세히 들여다본다.", image: { src: r.evidence.icon, alt: r.evidence.name, item: true }, found: r.isNew ? "new" : "again" });
    } else {
      setDialog({ kind: "narrate", key: `${spot.id}-${Date.now()}`, title: spot.label, text: r.text });
    }
  }

  function onSpot(spot: Hotspot) {
    setCardId(null);
    if (spot.closeup) {
      setTarget(null);
      play("open");
      setCloseupId(spot.closeup);
      setDialog({ kind: "narrate", key: `cu-${spot.id}-${Date.now()}`, title: spot.label, text: "가까이 들여다본다. 수상한 곳을 눌러 보자." });
      return;
    }
    void look(spot);
  }

  function onHit(h: Hit) {
    if (done || busy) return;
    if (h.type === "suspect") {
      setCardId(null);
      setTarget(h.id);
      // 지금 고른 사람의 말은 그 사람에게 내밀 수 없다 (서버 규칙).
      if (draft.clueId && view.evidence.find((e) => e.id === draft.clueId)?.suspectId === h.id) setDraft((d) => ({ ...d, clueId: null }));
      return setDialog({ kind: "edit" });
    }
    if (h.type === "spot") return onSpot(h.spot);
    if (h.type === "teacher") {
      // 강사님은 대화만: 당황한 한두 문장을 번갈아 말한다. 질문 입력·차감·기록 없음.
      play("tick");
      setCardId(null);
      setTeacherTalks((n) => n + 1);
      return setDialog({ kind: "narrate", key: `teacher-${Date.now()}`, title: view.scenario.victim, text: TEACHER.lines[teacherTalks % TEACHER.lines.length], figure: { src: TEACHER.figure, alt: `${view.scenario.victim}의 표정` } });
    }
    play("tick");
    setEmptyClicks((n) => n + 1);
    setDialog({ kind: "narrate", key: `empty-${Date.now()}`, title: "살펴보기", text: view.scenario.emptyText });
  }

  function moveTo(id: string) {
    if (id === sceneId || busy) return;
    const next = view.scenario.scenes.find((s) => s.id === id)!;
    setSceneId(id);
    setCloseupId(null);
    setCardId(null);
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
    if (busy) return;
    const own = view.evidence.find((e) => e.id === id)?.suspectId;
    setDraft((d) => ({ ...d, clueId: id }));
    setOverlay(null);
    setCloseupId(null);
    setCardId(null);
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
        setDialog({ kind: "notice", key: `notice-${Date.now()}`, text: r.text, used: r.used });
        return;
      }
      setDraft(emptyDraft);
      // 심문도 진행이다. 열심히 묻는 중에 '막혔나?' 힌트가 끼어들지 않게 한다.
      setLastProgress(Date.now());
      setEmptyClicks(0);
      play(r.message.gainedClueId ? "found" : r.message.emotion === "flustered" ? "fluster" : "reply");
      setDialog({ kind: "answer", messageId: r.message.id, animate: true, used: r.used, thought: r.thought });
    } catch (e) {
      play("notice");
      // 연결이 끊긴 경우(status 0)에는 서버가 처리했을 수도 있다. 같은 내용으로 다시 물으면 중복 차감 없이 이어진다.
      const lost = e instanceof ApiError && e.status === 0;
      setDialog({ kind: "notice", key: `err-${Date.now()}`, text: `${(e as Error).message} ${lost ? "같은 내용으로 다시 물으면 두 번 차감되지 않는다." : "질문은 차감되지 않았다. 같은 내용으로 다시 물을 수 있다."}` });
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
  // 'prompt'(누구에게 증거를 내밀지 고르는 중)는 쉬는 상태가 아니다. 자동 힌트가 안내를 덮어쓰지 않게 한다.
  const idle = !done && !overlay && !closeup && !card && dialog.kind === "narrate";
  const stuckMs = tick - lastProgress;
  const hintReady = !!missing && (stuckMs > HINT_GLOW_MS || emptyClicks >= EMPTY_CLICKS_GLOW);

  // 다음 기준 시각(반짝임·자동 힌트)에 한 번만 깨어난다. 제출 뒤나 단서를 다 찾으면 멈춘다.
  // 오래 막혀 있으면 단서마다 한 번씩 흐릿한 힌트를 저절로 말한다.
  useEffect(() => {
    if (done || !missing) return;
    const now = Date.now();
    const next = [lastProgress + HINT_GLOW_MS, lastProgress + HINT_AUTO_MS].filter((t) => t > now);
    if (!next.length) return;
    const t = setTimeout(() => setTick(Date.now()), Math.min(...next) - now + 50);
    return () => clearTimeout(t);
  }, [done, missing, lastProgress, tick]);
  const autoHintDue = view.me.started && idle && !!missing && autoHinted !== missing && stuckMs > HINT_AUTO_MS && !(hintsShown[missing] > 0);
  useEffect(() => {
    if (!autoHintDue) return;
    setAutoHinted(missing);
    hint();
    // 조건이 참으로 바뀌는 순간 한 번만 말한다. hint·missing은 그 순간의 값을 쓰면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHintDue]);

  // 표정이 바뀔 때 깜빡이지 않게 상반신·초상 그림을 미리 받아 둔다.
  // 장면을 다시 그릴 때마다 suspects 배열이 새로 만들어지므로, 사람 구성이 바뀔 때만 다시 받는다.
  const castKey = view.scenario.suspects.map((s) => s.id).join(",");
  useEffect(() => {
    for (const s of view.scenario.suspects) for (const src of [...Object.values(s.sprites), ...Object.values(s.portraits)]) new Image().src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castKey]);

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
      // Esc는 열린 수첩·증거 가방부터 닫는다 (확인창은 자기 Esc를 먼저 처리한다).
      if (e.key === "Escape" && overlay) return setOverlay(null);
      if (t.closest("input, textarea, select, [role=dialog]:not(.closeup)") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "n" && !busy) {
        play("open");
        setOverlay({ kind: "notebook" });
      }
      if (e.key === "Escape") {
        setCloseupId(null);
        setCardId(null);
      }
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
        }}
      />
    );
  }

  return (
    <div className={`game ${done ? "is-done" : ""} ${talking || npcFigure ? "is-talking" : ""}`}>
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
            if (busy) return;
            play("open");
            setOverlay({ kind: "notebook" });
          }}
          onHint={() => {
            if (busy) return;
            setCloseupId(null);
            setCardId(null);
            setTarget(null);
            hint();
          }}
          hintReady={hintReady && idle}
        />
        <Stage view={view} scene={scene} target={target} disabled={done || busy} onHit={onHit} />
        {closeup && <Closeup view={view} data={closeup} onSpot={(h) => void look(h)} onOpen={setCloseupId} onClose={() => setCloseupId(null)} />}
        {card && !closeup && <ClueView title={card.name} form={card.form ?? "paper"} text={card.text} onClose={() => setCardId(null)} />}
        {gain && !closeup && !card && (
          <div className="gain-card" role="status">
            <span className="px-tag">{gain.label}</span>
            <ClueCard form={gain.form} title={gain.title} text={gain.text} size="md" />
          </div>
        )}
        {talking && talker && (
          <figure key={talker.id} className={`talk-figure ${dialog.kind === "thinking" ? "is-thinking" : ""}`} aria-label={`${talker.name} · 대화 중`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 픽셀 스프라이트 원본 그대로 */}
            <img key={talkEmotion} src={talker.sprites[talkEmotion]} alt={`${talker.name}의 표정`} draggable={false} className={talkEmotion === "flustered" && dialog.kind === "answer" ? "shake" : ""} />
          </figure>
        )}
        {npcFigure && (
          <figure key={npcFigure.src} className="talk-figure" aria-label={npcFigure.alt}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 픽셀 스프라이트 원본 그대로 */}
            <img src={npcFigure.src} alt={npcFigure.alt} draggable={false} className="shake" />
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
