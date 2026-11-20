"use client";
/* eslint-disable @next/next/no-img-element -- 픽셀 초상 */
import { useEffect, useState } from "react";
import type { GameView } from "@/lib/view/types";
import type { GameActions, KeyboardTestResult } from "@/lib/mock/useMockGame";
import { questionsLeft } from "@/lib/view/rules";
import { PixelIcon } from "@/components/pixel/PixelIcon";

const TYPED = "asdf jkl; 1234";

/**
 * 키보드 테스트 (시나리오 단서 10). 고른 사람의 키보드를 눌러 보고, 그 사람 PC와 윤찬 PC 중
 * 어디에 글자가 찍히는지 두 화면을 나란히 보여 준다. 처음 테스트하는 사람은 질문 1회를 쓴다.
 */
export function KeyboardTest(props: { view: GameView; actions: GameActions; preset: string | null; onDone: (r: KeyboardTestResult) => void; onClose: () => void }) {
  const { view, actions, preset, onDone, onClose } = props;
  const victim = view.scenario.suspects.find((s) => s.isVictim)!;
  const [pick, setPick] = useState<string | null>(preset);
  const [result, setResult] = useState<KeyboardTestResult | null>(null);
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const who = view.scenario.suspects.find((s) => s.id === pick);
  const again = !!pick && view.testsDone.includes(pick);
  const left = questionsLeft(view);

  useEffect(() => {
    if (!result) return;
    setN(0);
    const t = setInterval(() => setN((x) => (x >= TYPED.length ? (clearInterval(t), x) : x + 1)), 70);
    return () => clearInterval(t);
  }, [result]);

  const run = async () => {
    if (!pick) return;
    setBusy(true);
    const r = await actions.keyboardTest(pick);
    setBusy(false);
    setResult(r);
  };

  const typed = TYPED.slice(0, n);
  const finished = result && n >= TYPED.length;

  return (
    <div className="kbtest px" role="dialog" aria-label="키보드 테스트">
      <div className="closeup-bar">
        <span className="px-tag"><PixelIcon name="look" size={14} /> 키보드 테스트</span>
        <button className="px-btn small" onClick={onClose} aria-label="닫기"><PixelIcon name="close" size={12} /> 닫기</button>
      </div>
      {!result ? (
        <div className="kb-pick">
          <p className="say">누구의 무선 키보드를 눌러 볼까? 그 사람 PC와 {victim.name}의 PC 화면을 같이 본다.</p>
          <div className="kb-people">
            {view.scenario.keyboardTest.candidates.map((id) => {
              const s = view.scenario.suspects.find((x) => x.id === id)!;
              const done = view.testsDone.includes(id);
              return (
                <button key={id} className={`kb-person ${pick === id ? "on" : ""}`} onClick={() => setPick(id)} aria-pressed={pick === id}>
                  <img src={s.portraits.neutral} alt="" />
                  <b>{s.name}</b>
                  <small>{done ? "다시 보기 · 차감 없음" : "질문 1회"}</small>
                </button>
              );
            })}
          </div>
          <div className="kb-actions">
            <span className="hint">남은 질문 {left}</span>
            <button className="px-btn on" disabled={!pick || busy || (!again && left <= 0)} onClick={run}>
              {who ? `${who.name}의 키보드 눌러 보기` : "사람을 골라 줘"} {pick && !again && "· 1회"}
            </button>
          </div>
        </div>
      ) : (
        <div className="kb-run">
          <div className="kb-screens">
            <figure className="kb-screen">
              <div className="pc-screen mini">
                <span className="mini-title">{who?.name}의 PC</span>
                <p className="typed">{result.typedOn === "self" ? typed : ""}<span className="caret" /></p>
              </div>
              <figcaption>{who?.name}의 모니터</figcaption>
            </figure>
            <div className="kb-arrow" aria-hidden="true">
              <img src="/game/items/gk-10.png" alt="" />
              <span className="keys">{finished ? "" : "타닥 타닥"}</span>
            </div>
            <figure className="kb-screen">
              <div className="pc-screen mini">
                <span className="mini-title">{victim.name}의 PC</span>
                <p className="typed">{result.typedOn === "b" ? typed : ""}<span className="caret" /></p>
              </div>
              <figcaption>{victim.name}의 모니터</figcaption>
            </figure>
          </div>
          {finished && (
            <div className="kb-result">
              <p className="say">{result.evidence.text}</p>
              {result.line && <p className="say quote">{who?.name}: “{result.line}”</p>}
              <p className="found new">▶ 수첩에 테스트 결과로 적었다{result.charged ? " · 질문 1회 사용" : " · 다시 본 것이라 차감 없음"}</p>
              <div className="kb-actions">
                <button className="px-btn" onClick={() => (setResult(null), setPick(null))}>다른 사람 테스트</button>
                <button className="px-btn on" onClick={() => onDone(result)}>확인</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
