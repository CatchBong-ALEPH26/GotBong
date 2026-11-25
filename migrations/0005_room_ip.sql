-- GotBong D1 Migration 0005
-- 같은 접속 IP에서 동시에 진행 중인 방 수 제한(7개)을 세기 위한 열과 인덱스.
-- 열과 인덱스를 추가만 한다. 기존 기록은 지우지 않고, 기존 방은 ip_hash 가 비어 IP별 수에 들어가지 않는다.
--
-- ip_hash: 접속 IP(cf-connecting-ip)의 SHA-256 해시 앞 32자 (lib/server/game-http.mjs ipKey). IP 원문은 저장하지 않는다.
-- 롤백: 예전 코드는 이 열을 읽지 않으므로 그대로 둔 채 되돌릴 수 있다.

ALTER TABLE games ADD COLUMN ip_hash TEXT;

CREATE INDEX IF NOT EXISTS games_active_ip
ON games(ip_hash, last_active_at) WHERE status = 'active';
