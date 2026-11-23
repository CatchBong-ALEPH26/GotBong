# AGENTS.md — GotBong 작업 지침 (AI·사람 공통)

이 저장소에서 작업하는 AI 도구는 코드 수정 전에 이 파일을 먼저 읽는다. 실행 방법의 기준은 `README.md`, 배포·운영 리소스의 기준은 `docs/CLOUDFLARE_DEPLOYMENT.md`다.

## 1. 현재 구조 (Cloudflare 중심 단일 구조)

화면(Next.js 앱 라우터)과 API를 vinext로 **하나의 Cloudflare Worker**에서 실행하고, 게임 기록은 Cloudflare D1에 저장한다. 별도 Node.js API 서버는 없다(2026-11-22 제거).

| 위치 | 내용 |
|---|---|
| `app/`, `components/`, `lib/view/`, `lib/scene/` | 화면 |
| `lib/api/useGame.ts` | 화면 ↔ `/api/*` 연결, 화면 전용 상태는 `localStorage` |
| `app/api/{session,question,submit,reset}/route.js` | Workers API 4개 |
| `lib/server/` | `db-d1.mjs`(D1 접근), `game-http.mjs`(오류·쿠키·입력 검증·공개 턴) |
| `lib/game/` | 배정·상태 기계(`game.mjs`), 조사 치환(`josa.mjs`), 시나리오·캐릭터·피해자(`data/`) |
| `lib/ai/` | 모델 선택 Fixture/OpenAI/Gemini(`llm.mjs`), 질문 파이프라인(`pipeline.mjs`), 프롬프트(`prompts.mjs`) |
| `migrations/` | D1 스키마 (`0001`, `0002` 운영 적용 완료) |
| `test/` | `game.test.mjs`(게임 규칙), `api.test.mjs`(Workers API 계약, `node:sqlite` D1 대역) |
| `docs/game/` | Node 서버 시절 설계 기록. 규칙·API 설명은 참고하되 **파일 경로는 위 표를 따른다** |

## 2. 명령

| 명령 | 용도 |
|---|---|
| `npm run db:migrate:local` | 처음 한 번, 로컬 D1(`.cloudflare/state`)에 테이블 생성. `--local` 고정 |
| `npm run dev` | 로컬 개발 서버 http://localhost:3000 (화면 + API) |
| `npm test` | 테스트. 실제 Cloudflare·AI 호출 없음 |
| `npm run build` | Workers 빌드 |
| `npm run lint` | ESLint |
| `npm run deploy` | 운영 배포 — **승인 없이 실행 금지** |
| `npm run eval` | 실제 모델 평가 — **유료, 승인 없이 실행 금지** |

작업 후 최소 `npm test`, `npm run build`를 실행해 결과를 보고한다.

## 3. 금지 사항 (승인 없이 하지 않는다)

- 운영 D1(`gotbong-dev`, ID `215068c4-…`)과 과거 개인 계정 D1(`0737af8d-…`)의 데이터 변경·초기화·삭제, 마이그레이션 재실행. D1 명령에는 항상 `--local`을 붙였는지 확인한다.
- `main` 직접 push, `--force` push, Cloudflare 배포(`npm run deploy`, `cf deploy`).
- API 키·토큰을 코드·`.env.example`·문서·커밋에 쓰기. Cloudflare Secrets 등록.
- 비용이 드는 실제 AI 호출(`npm run eval`, OpenAI·Gemini 키로 실행).
- 기존 게임 기록(`games`, `turns`, `requests`) 삭제.

작업은 별도 브랜치에서 하고, Pull Request로 리뷰받는다.

## 4. 지켜야 할 계약

- **API 형태:** `GET /api/session` → `{ intro, victim, clues, npcs, mode, remaining, maxQuestions, turns, result }` / `POST /api/question` `{ npc, question, requestId, attach? }` → `accepted | clarify | rejected` / `POST /api/submit` `{ npc, motive, requestId }` → `{ result: { score, truth, cast } }` / `POST /api/reset` → 새 사건, `game` 쿠키 교체. 오류는 HTTP 상태 + `{ error: string }`. 화면은 상대 경로 `/api/*`만 쓴다.
- **비공개 정보:** 최종 제출 전에는 역할 배정(A~D), 사실 태그(`facts`), 해금 상태를 브라우저에 보내지 않는다. `publicTurn()` 반환 필드를 바꾸면 유출 여부를 확인한다. 범인 역할은 D지만 사람과 역할 배정은 게임마다 바뀐다.
- **멱등성·동시성:** 클라이언트 `requestId`, `requests` 테이블의 `fingerprint`, `games.revision` + `db.batch()` 원자 저장을 제거하지 않는다.
- **스키마 변경:** 기존 마이그레이션을 고치지 말고 번호를 올린 새 파일로 추가하고, 데이터 보존·롤백을 검토한다.
- 화면 전용 상태(찾은 단서, 메모, 연필 선 등)는 `localStorage`에 있고 D1로 옮겨지지 않았다.

## 5. 아직 검증되지 않은 것 (완료로 가정하지 않는다)

- 실제 OpenAI·Gemini 호출(Workers 런타임 호환, 비용, 시간 제한). 현재 운영은 Fixture 모드.
- 로컬 Worker에서 실제 AI 키를 쓰는 방법.
- 질문 API 동시 경합 시 409 대신 500이 나올 가능성.
- GitHub push 시 자동 배포 (현재는 CLI 수동 배포).
- 팀원별 Cloudflare 계정 권한 부여.

## 6. 참고

- 줄바꿈: 일부 기존 파일은 CRLF다. 수정할 때 파일 전체의 줄바꿈을 바꾸지 않는다.
- 게임 규칙·캐릭터 설계 배경: `docs/game/ARCHITECTURE.md`, `docs/game/HANDOFF.md`, `docs/game/INTEGRATION.md`.
