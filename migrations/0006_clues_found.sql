-- GotBong D1 Migration 0006
-- 현장에서 찾은 단서 카드 기록 (JSON 배열, 예: ["trash","source"]). 찾은 단서만 질문에 첨부할 수 있다.
-- 게임 상태(state)와 다른 열에 둔다: 질문 저장은 state 전체를 덮어쓰고 revision 을 올리므로,
-- 같은 곳에 두면 질문을 기다리는 사이 찾은 단서가 사라지거나 질문 저장이 충돌한다.
-- 조사 API는 이 열에 항목을 추가만 한다(revision 을 바꾸지 않음). 열을 추가만 하고 기존 기록은 지우지 않는다.
-- 롤백: 예전 코드는 이 열을 읽지 않으므로 그대로 둔 채 되돌릴 수 있다.

ALTER TABLE games ADD COLUMN clues_found TEXT NOT NULL DEFAULT '[]';
