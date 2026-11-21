
-- GotBong D1 Migration 0002
-- 게임 상태 변경 버전 추가
-- 기존 게임 데이터는 유지한다.

ALTER TABLE games
ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;