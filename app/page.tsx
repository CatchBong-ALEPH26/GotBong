"use client";
import { useRouter } from "next/navigation";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

/** 타이틀 화면. 1인용이라 바로 사건으로 들어간다. 하던 게임이 있으면 서버가 이어서 준다. */
export default function Title() {
  const router = useRouter();
  return (
    <main className="screen center">
      <SceneBackdrop />
      <div className="title-block">
        <p className="title-kicker">AI 용의자 추리게임</p>
        <h1 className="game-title">방과후 탐정단</h1>
        <p className="title-sub">스무 번의 질문으로 진실을 밝혀라</p>
      </div>
      <div className="px window lobby">
        <span className="px-tag">사건 파일</span>
        <p className="say">범인은 게임마다 바뀐다. 네 사람에게 묻고, 범인과 동기를 맞혀라.</p>
        <button className="px-btn on block" onClick={() => router.push("/play")}>
          사건 시작
        </button>
      </div>
    </main>
  );
}
