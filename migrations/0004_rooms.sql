-- GotBong D1 Migration 0004
-- 방(게임) 관리: 플레이어 번호, 상태, 마지막 활동 시각, 차단 기록.
-- 열과 인덱스를 추가만 한다. 기존 기록은 지우지 않는다.
--
-- status: 'active'(진행 중) | 'ended'(종료: 제출했거나 새 게임으로 넘어감)
--         | 'blocked_expired'(차단: 15분 무응답) | 'blocked_admin'(차단: 관리자)
-- block_reason: 'idle' | 'admin' (사람이 읽는 메모를 덧붙여도 된다)
--
-- 롤백: 새 코드는 이 열들이 있어야 동작한다. 예전 코드는 이 열들을 읽지 않으므로 그대로 둔 채 되돌릴 수 있다.

ALTER TABLE games ADD COLUMN player TEXT;
ALTER TABLE games ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE games ADD COLUMN last_active_at INTEGER;
ALTER TABLE games ADD COLUMN blocked_at INTEGER;
ALTER TABLE games ADD COLUMN block_reason TEXT;

-- 기존 기록: 제출한 게임은 종료. 나머지는 만든 시각을 마지막 활동으로 본다
-- (15분이 지난 방은 방 수에서 빠지고, 다음 접속이나 매일 정리 때 차단(만료)으로 표시된다).
UPDATE games SET status = 'ended' WHERE result IS NOT NULL;
UPDATE games SET last_active_at = created_at WHERE last_active_at IS NULL;

-- 방 수 세기용 부분 인덱스: 진행 중인 방만 담아 읽는 행 수를 줄인다 (D1 무료 읽기 한도 하루 500만 행).
CREATE INDEX IF NOT EXISTS games_active_recent
ON games(last_active_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS games_active_player
ON games(player, last_active_at) WHERE status = 'active';
