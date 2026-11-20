"use client";
import { use } from "react";
import { useMockGame } from "@/lib/mock/useMockGame";
import { Waiting } from "@/components/Waiting";
import { GameScreen } from "@/components/game/GameScreen";
import { Report } from "@/components/Report";
import { DevBar } from "@/components/DevBar";

/** 방 화면: 방 상태에 따라 대기실 / 진행 / 보고서를 고른다. */
export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { view, actions } = useMockGame(code.toUpperCase());

  return (
    <>
      {view.status === "waiting" && <Waiting view={view} actions={actions} />}
      {view.status === "playing" && <GameScreen view={view} actions={actions} />}
      {view.status === "finished" && <Report view={view} />}
      <DevBar status={view.status} onStatus={actions.debugSetStatus} />
    </>
  );
}
