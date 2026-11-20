"use client";
import type { RoomStatus } from "@/lib/view/types";

/** 개발용: 서버 없이 화면 단계를 바로 바꿔 보는 바. API 연결 후 제거한다. */
export function DevBar({ status, onStatus }: { status: RoomStatus; onStatus: (s: RoomStatus) => void }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="devbar no-print">
      <span>DEV 화면 전환</span>
      {(["waiting", "playing", "finished"] as RoomStatus[]).map((s) => (
        <button key={s} className={status === s ? "on" : ""} onClick={() => onStatus(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
