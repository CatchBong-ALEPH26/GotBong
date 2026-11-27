"use client";
import type { GameView } from "@/lib/view/types";
import { questionsLeft } from "@/lib/view/rules";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { setSound, useSoundOn } from "@/lib/audio/sound";

/**
 * 화면 위 작은 표시들: 수첩, 장소, 찾은 단서(누르면 힌트), 남은 질문, 소리.
 * 서버가 테스트 모드(고정 응답)면 알려 준다.
 */
export function Hud(props: { view: GameView; sceneId: string; onMove: (id: string) => void; onNotebook: () => void; onHint: () => void; hintReady: boolean }) {
  const { view, sceneId, onMove, onNotebook, onHint, hintReady } = props;
  const scenes = view.scenario.scenes;
  const here = scenes.find((s) => s.id === sceneId)!;
  const others = scenes.filter((s) => s.id !== sceneId);
  const qLeft = questionsLeft(view);
  const found = view.clues.filter((c) => c.found).length;
  const total = view.clues.length;
  const soundOn = useSoundOn();
  return (
    <div className="hud">
      <button className="px-btn hud-note" onClick={onNotebook} aria-label={`수첩 열기, 단서 ${view.evidence.length}개`}>
        <PixelIcon name="note" />
        <span>수첩</span>
        {view.evidence.length > 0 && <span className="hud-badge">{view.evidence.length}</span>}
      </button>
      <div className="hud-place" role="group" aria-label="장소">
        <span className="px-tag place-now">{here.name}</span>
        {others.map((s) => (
          <button key={s.id} className="px-btn small place-go" onClick={() => onMove(s.id)} aria-label={`${s.name}로 이동`}>
            {s.name}로 <PixelIcon name="right" size={12} />
          </button>
        ))}
      </div>
      <div className="hud-right">
        {view.preview && (
          <span className="px-chip chip-warn" title="서버가 아직 예전 사건이라, 화면 확인용 임시 내용으로 돌아가는 중">화면 미리보기</span>
        )}
        {!view.preview && view.mode === "fixture" && (
          <span className="px-chip chip-warn" title="AI 키가 없어 고정 응답으로 동작 중">테스트 모드</span>
        )}
        <button
          className={`px-chip hud-clues ${found === total ? "chip-done" : ""} ${hintReady ? "chip-glow" : ""}`}
          onClick={onHint}
          title="막히면 눌러서 생각해 보기"
          aria-label={`단서 ${total}개 중 ${found}개 찾음. 눌러서 힌트 보기`}
        >
          <PixelIcon name="bulb" size={14} /> 단서 {found}/{total}
        </button>
        <span className={`px-chip ${qLeft <= 5 ? "chip-warn" : ""}`} aria-label={`남은 질문 ${qLeft}개`}>
          남은 질문 {qLeft}
        </span>
        <button className="px-chip hud-sound" onClick={() => setSound(!soundOn)} aria-pressed={soundOn} aria-label={soundOn ? "소리 끄기" : "소리 켜기"} title={soundOn ? "소리 끄기" : "소리 켜기"}>
          <PixelIcon name={soundOn ? "sound" : "mute"} size={16} />
        </button>
      </div>
    </div>
  );
}
