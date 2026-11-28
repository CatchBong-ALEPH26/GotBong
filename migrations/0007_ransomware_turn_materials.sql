-- v3.6 증언 속 자료 및 대화 단서: 질문 턴에 일관되게 저장
ALTER TABLE turns ADD COLUMN material TEXT;
ALTER TABLE turns ADD COLUMN gained TEXT;
