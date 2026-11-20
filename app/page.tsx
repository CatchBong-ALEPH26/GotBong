"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SceneBackdrop } from "@/components/pixel/SceneBackdrop";

/** 타이틀 화면: 닉네임, 방 만들기, 코드로 입장. */
export default function Lobby() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const nameOk = nickname.trim().length > 0;
  const codeOk = code.trim().length === 6;

  return (
    <main className="screen center">
      <SceneBackdrop />
      <div className="title-block">
        <p className="title-kicker">AI 용의자 추리게임</p>
        <h1 className="game-title">방과후 탐정단</h1>
        <p className="title-sub">스무 번의 질문으로 진실을 밝혀라</p>
      </div>
      <div className="px window lobby">
        <span className="px-tag">탐정 등록</span>
        <label className="px-field">
          <span>닉네임</span>
          <input value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} placeholder="예: 셜록킴" />
        </label>
        <button className="px-btn on block" disabled={!nameOk} onClick={() => router.push("/room/" + Math.random().toString(36).slice(2, 8).toUpperCase())}>
          새 방 만들기
        </button>
        <p className="or">또는</p>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameOk && codeOk) router.push("/room/" + code.trim().toUpperCase());
          }}
        >
          <input value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="방 코드 6자리" aria-label="방 코드" />
          <button className="px-btn" disabled={!nameOk || !codeOk}>입장</button>
        </form>
      </div>
    </main>
  );
}
