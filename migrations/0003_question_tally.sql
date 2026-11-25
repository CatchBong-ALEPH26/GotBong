-- GotBong D1 Migration 0003
-- 질문 처리용 게임별 집계 (JSON): 차감 없는 응답 연속 횟수(free), 기준별 연속 낮음 횟수(lows).
-- 열을 추가만 한다. 기존 게임은 빈 집계('{}')로 시작한다.

ALTER TABLE games
ADD COLUMN tally TEXT NOT NULL DEFAULT '{}';
