# GotBong — 랜섬웨어 사건 v3.6 서버 통합 설계 및 검증 가이드

## 변경 범위

- 기준 문서: `docs/scenarios/ransomware/scenario.md`, 단일 버전 `v3.6`
- 역할 ID 호환성: A=자랑, B=초조, C=심부름, D=불씨. ID에 배정하는 실제 캐릭터는 기존대로 무작위.
- 알리바이 분기: `cast._alibi`에 'A' 또는 'B'를 추가하여 기존 D1 `games.cast` JSON 필드를 재사용한다. 게임 시작 후 변경 불가.
- 피해자: `홍정민 강사님` 고정. 이전 세션은 새 세션으로 대체하고 쿠키를 갱신한다.
- 현장 조사: 단서 4장. 스마트폰 푸념 메시지는 별도 1장으로 `자랑`과 멘토링 심문 후에만 획득.
- 자료 4종은 독립 단서 카드가 아니라 `turn.material`에 저장된다. `turn.gained`는 대화로 획득한 스마트폰 카드.
- 질문 총 20회, 프런트 디자인/미리보기와 AI 모델 호출 구조는 유지.
- `migrations/0007_ransomware_turn_materials.sql`는 `turns.material`, `turns.gained` 텍스트 JSON 열을 추가한다. `migrations/0006_clues_found.sql` 선행 적용 필수.

## 게임 서버 적용 전 반드시 해결할 검증

1. 새 시나리오에서 기존 유령 키보드 중심의 `test/game.test.mjs`, `test/api.test.mjs` 테스트는 다시 작성/분리한다. 기존 테스트를 삭제하거나 테스트 명령에서 숨기지 않는다.
2. 실제 LLM 판정기는 구조화된 사실 ID를 정확하게 `disclosed`로 되돌려야 한다. 이 결과로 `material`/`gained`의 노출 시각과 20회 내 풀이 가능 여부가 결정된다. 자동화 테스트를 실제 모델·Fixture 양쪽으로 수행한다.
3. `app/api/question/route.js`의 대화 단서 획득이 DB 커밋과 원자적으로 기록되는지 로컬 D1로 검증한다. 새로고침 후 `turn.material`와 `turn.gained`가 유지되어야 한다.
4. `app/api/session/route.js`에서 이전 유령 키보드 쿠키를 가진 플레이어가 v3.6 세션으로 전환되는지 검증한다. 새 게임 생성 제한을 위반하지 않도록 한다.
5. 48개 무작위 배정 조합마다 `roleOf()`, `templateVars()`의 이름 치환, A/B 누설 차단, 범인·동기 판정을 전수 검사한다.
6. 증거를 한 번씩 순차 제시했을 때 M01/M02/M03 자동 해결과 M04 선행 차단이 의도대로 작동하는지 검사한다.
7. 시작 화면 및 수첩의 사건 소개가 범인을 노출하지 않는지, `isNewCase()`에서 실제 서버로 전환되는지, 조사 좌표와 서버 단서 매핑이 일치하는지 브라우저에서 확인한다.
8. 모델 최종 답변이 기술적 방법을 새로 만들어 설명하지 않도록 프롬프트 및 답변 검증을 포함한 안전 테스트를 수행한다.

## 코드 적용을 위해 판단한 사항

- UI 계약을 맞추기 위해 현장 단서 ID는 이미 프런트 미리보기에 존재하는 `shortcut`, `usblog`, `mentoring`, `usb`, `message`를 그대로 사용한다.
- 기존 `case.mjs`는 `ghost-keyboard.mjs`에 복제해 보존하며, `case.mjs`는 v3.6 데이터 재수출 모듈로 사용한다. 새 시나리오 이외의 시스템은 기존 AI 구조를 재사용한다.
- 기존 `case.mjs` 파일의 키워드·사실은 교체되고, 기존 게임 테스트는 더 이상 정상 기준이 아니다. 새 시나리오에 맞춘 API/E2E 통합 테스트로 치환해야 한다.
- `B` 등급은 정답이나 주요 모순을 0~3개 해결한 경우로 정의했다. 오답은 `C`이다.
- 문서의 모순: 심부름은 13:18에 현장 목격, 따라서 '전 범행 시간 식당 알리바이'가 아니라 13:05~13:10 핵심 시점의 알리바이로만 설명한다.
- 제출물 제목/문서 내부 버전은 v3.6으로 통일하고, '며칠 동안 계획'은 전날 밤 준비로 정리했다.

## 검증 명령

```bash
node scripts/apply-v3.6.mjs --check
node scripts/apply-v3.6.mjs --apply
node --test test/ransomware-v3.6.test.mjs
npm test
npm run lint
npm run build
npm run db:migrate:local
```

**주의:** `npm test`, `npm run build`, `npm run db:migrate:local`을 이번 산출물에서는 실행하지 않았다. 기존 저장소 전체 소스와 의존성을 로컬로 가져올 수 없었고 GitHub 원격 쓰기도 403으로 거부됐다. 검증 없이 운영 배포하지 않는다.
