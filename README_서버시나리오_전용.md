# GotBong — 유령 키보드 v2 서버·시나리오 전용 패치

**대상 기준:** `main` 최신 확인 SHA `5b9cacbd9b1373683707d240ff1e58594f76064c` (2026-11-25 22:48 KST).

이 패키지는 **서버·시나리오부터 반영하고 AI 담당자에게는 별도 코드를 전달**하기 위한 분리본입니다. GitHub 연결의 브랜치 생성이 HTTP 403으로 거부되어 **원격 저장소에는 아직 적용되지 않았습니다**. `main`, 운영 DB, Cloudflare에도 반영하지 않았습니다.

## 범위

- `lib/game/data/case.mjs`: A 사진 증언, B 코드 비교, C 앞쪽 USB 증거, D 키보드 미사용 거짓말 및 증언 정교화
- `lib/game/game.mjs`: 필수 근거 없이는 중요 자백 사실을 해금하지 않는 잠금 조건, 서버 현장 단서 매핑
- `lib/game/contradictions.mjs` (신규): 핵심 4개 + 선택 2개 공식 모순 완료 판정, 중복 보상 방지
- `app/api/{question,investigate,session,reset}/route.js`: 단서 발견 기록·첨부 검증·공식 완료·세션 복원
- `lib/scene/classroom.ts`: 앞쪽 USB 단서와 클릭 위치 연결
- `lib/api/useGame.ts`: **최소한의 API 연결 호환 수정만 포함**. 기존 화면 디자인·수첩·연출은 변경하지 않음. 모든 현장 단서를 서버에 등록하기 위해 필요함.
- `test/api.test.mjs`, `test/game.test.mjs`, `test/contradictions.test.mjs` (신규): 회귀·모순 판정 테스트

**이 패키지에서 수정하지 않는 파일:** `lib/ai/**`, `components/game/**`, `lib/view/types.ts`, 운영 환경과 마이그레이션.

**주의:** 공식 모순은 서버에 기록되지만 UI의 `모순 해결 알림·수첩 진행도`는 이번 패키지에서 표시하지 않습니다. AI 담당자의 작업이 끝난 뒤 UI와 함께 적용하세요. 답변 자체는 기존 대화창에서 계속 표시됩니다.

## 적용 (Windows PowerShell)

```powershell
cd C:\Users\User\Documents\GitHub\GotBong
# 다른 작업이 있으면 먼저 커밋하거나 보관하세요.
git switch main
git pull origin main
git switch -c feat/ghost-keyboard-v2-server-scenario
```

별도로 압축 해제한 이 폴더에서 다음 명령을 실행합니다. 경로는 실제 클론 위치에 맞게 변경하세요.

```powershell
py .\apply_server_scenario_v2.py "C:\Users\User\Documents\GitHub\GotBong" --check
py .\apply_server_scenario_v2.py "C:\Users\User\Documents\GitHub\GotBong" --apply
```

이후 저장소에서 반드시 실행하세요.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
git diff --check
git status
```

변경 내용을 검토한 뒤 **작업 브랜치에 커밋하고 PR 생성**합니다. `main` 직접 push, 운영 D1 조작, `cf deploy`, 유료 OpenAI 테스트는 하지 않습니다. AI 담당자용 ZIP은 이와 별도이며, **이 ZIP과 한 번에 적용하지 않습니다.**

## 검증 상태

- 독립 모순 판정 테스트 `16/16` 통과
- 패치 앵커 기반 합성 환경 설치/Node 문법 검사 통과
- **원본 저장소 통합 `npm test`/`npm run build` 미실행**: 실제 로컬 Git 클론과 GitHub 쓰기 권한이 이 환경에 없음
- 아직 개발 중이던 방은 현장 단서가 브라우저에만 남아있을 수 있어 서버에 다시 등록해야 함

키보드 실험과 S/A/B/C 등급은 이번 범위에서 제외합니다.
