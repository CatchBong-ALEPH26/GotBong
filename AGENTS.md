# AGENTS.md — GotBong 작업 지침 (AI·사람 공통)

이 저장소에서 작업하는 AI 도구는 코드 수정 전에 이 파일을 먼저 읽는다. 실행 방법의 기준은 `README.md`, 배포·운영 리소스의 기준은 `docs/CLOUDFLARE_DEPLOYMENT.md`다.

## 1. 현재 구조 (Cloudflare 중심 단일 구조)

화면(Next.js 앱 라우터)과 API를 vinext로 **하나의 Cloudflare Worker**에서 실행하고, 게임 기록은 Cloudflare D1에 저장한다. 별도 Node.js API 서버는 없다(2026-11-22 제거).

| 위치 | 내용 |
|---|---|
| `app/`, `components/`, `lib/view/`, `lib/scene/` | 화면 |
| `lib/api/useGame.ts` | 화면 ↔ `/api/*` 연결, 화면 전용 상태는 `localStorage` |
| `app/api/{session,question,submit,reset,investigate}/route.js` | Workers API 5개 |
| `worker/index.js` | Worker 진입점: 접속 IP 허용 목록 확인 + vinext 처리(`fetch`) + 매일 휴면 방 만료 표시·빈 게임 정리(`scheduled`) |
| `lib/server/` | `db-d1.mjs`(D1 접근), `game-http.mjs`(오류·쿠키·입력 검증·공개 턴·방 확인), `rooms.mjs`(방 수 제한이 걸린 새 방), `access.mjs`(IP 허용 목록) |
| `lib/game/` | 배정·상태 기계·해금 점수 합산·차감·힌트 집계(`game.mjs`), 조사 치환(`josa.mjs`), 시나리오·캐릭터·피해자·속마음 문장(`data/`, `data/thoughts.mjs`) |
| `lib/ai/` | 모델 선택 Fixture/OpenAI/Gemini(`llm.mjs`), 질문 파이프라인(`pipeline.mjs`: 해금 판정 → 메인 모델 1회 → 답변 검증), 프롬프트(`prompts.mjs`: 캐시 친화 배치), 실제 호출 예산 장부(`budget.mjs`, 스크립트 전용) |
| `migrations/` | D1 스키마 (`0001`~`0005` 모두 운영 적용 완료. `0003` 질문 집계, `0004` 방 관리, `0005` 접속 IP별 방 수는 2026-11-25 적용) |
| `test/` | `game.test.mjs`(게임 규칙·해금 판정·힌트 금지어), `api.test.mjs`(Workers API 계약·차감·방 관리·IP, `node:sqlite` D1 대역) |
| `scripts/` | `eval.mjs`(말투·누설 평가), `judge-probe.mjs`(해금 판정 평가 세트), `cache-probe.mjs`(캐시 적중 확인), `dev-ai.mjs`(실제 키로 로컬 Worker). 모두 **유료 호출**이고, 앞의 셋은 장부 `docs/game/eval/ai-calls.jsonl` 누적 상한(`AI_CALL_BUDGET`, 기본 60)에서 멈춘다 |
| `docs/game/` | `AI_REDESIGN_DECISIONS.md`(해금 판정·차감·속마음·방 관리 설계와 구현 중 결정, **지금 규칙의 기준**). 나머지는 Node 서버 시절 기록: 참고하되 **파일 경로는 위 표를 따른다** |

## 2. 명령

| 명령 | 용도 |
|---|---|
| `npm run db:migrate:local` | 처음 한 번, 로컬 D1(`.cloudflare/state`)에 테이블 생성. `--local` 고정 |
| `npm run dev` | 로컬 개발 서버 http://localhost:3000 (화면 + API, 키 없이 Fixture) |
| `npm run dev:ai` | `.dev.vars`의 키로 로컬 Worker 실행 — **유료 호출, 승인 없이 실행 금지** |
| `npm test` | 테스트. 실제 Cloudflare·AI 호출 없음 |
| `npm run build` | Workers 빌드 |
| `npm run lint` | ESLint |
| `npm run deploy` | 운영 배포 — **승인 없이 실행 금지** |
| `npm run eval`, `node --env-file=.env scripts/judge-probe.mjs` | 실제 모델 평가 — **유료, 승인 없이 실행 금지** |

작업 후 최소 `npm test`, `npm run build`를 실행해 결과를 보고한다.

## 3. 금지 사항 (승인 없이 하지 않는다)

- 운영 D1(`gotbong-dev`, ID `215068c4-…`)과 과거 개인 계정 D1(`0737af8d-…`)의 데이터 변경·초기화·삭제, 마이그레이션 재실행·새 마이그레이션(`0006` 이후) 적용. D1 명령에는 항상 `--local`을 붙였는지 확인한다.
- `main` 직접 push, `--force` push, Cloudflare 배포(`npm run deploy`, `cf deploy`).
- API 키·토큰을 코드·`.env.example`·문서·커밋에 쓰기(로컬 `.env`, `.dev.vars`에만, 둘 다 Git 제외). Cloudflare Secrets 등록. 허용 IP 실제 값을 저장소에 쓰기.
- 비용이 드는 실제 AI 호출(`npm run eval`, OpenAI·Gemini 키로 실행).
- 기존 게임 기록(`games`, `turns`, `requests`) 삭제. 예외(팀 승인 2026-11-24): `worker/index.js`의 매일 정리가 **7일 지난, 질문·요청·제출이 모두 없는 빈 게임**만 지운다. 이 조건을 넓히려면 다시 승인받는다.

작업은 별도 브랜치에서 하고, Pull Request로 리뷰받는다.

## 4. 지켜야 할 계약

- **API 형태:** `GET /api/session` → `{ intro, victim, clues, npcs, mode, gameKey, remaining, maxQuestions, turns, result, closed? }` (`closed`: 차단된 방이면 `{ reason: expired|admin, message }`) / `POST /api/question` `{ npc, question, requestId, attach? }` → `accepted | clarify | rejected` + `remaining`, 선택 필드 `used`(이번에 쓴 질문 수), `thought`(반복 실패 힌트 속마음) / `POST /api/submit` `{ npc, motive, requestId }` → `{ result: { score, grader, truth, cast } }` (`grader`: 동기 채점 방식 `fixture|gemini|openai`, 범인이 틀리면 `null`) / `POST /api/reset` (JSON 요청만) → 지금 방을 종료하고 새 사건, `game` 쿠키 교체 / `POST /api/investigate` `{ spot }` → `{ clue: {id,title,detail} | null }` (용의자 모니터처럼 범인에 따라 달라지는 곳은 서버가 판정). 오류는 HTTP 상태 + `{ error: string, closed? }`, 안내 문장은 탐정 속마음(`data/thoughts.mjs`). 화면은 상대 경로 `/api/*`만 쓴다.
- **프롬프트 캐시:** 판정·검증은 같은 고정 앞부분(사건·대상·사실 전체 목록)과 NPC 단위로 고정된 같은 출력 스키마를 쓰고, 상태·대화 기록·질문은 뒤쪽에 둔다. 앞부분에 시각·무작위 값·현재 상태를 넣지 않는다(`AI_REDESIGN_DECISIONS.md` 12.9).
- **질문 처리:** 빠른 모델이 질문을 세고 질문별 기준 값을 낸 뒤, 코드가 앞 단계 대조·필요 근거 확인(없으면 S2 최대 1)·점수 합산·해금선 비교를 한다(해금 결정은 모델의 기준 값, 코드는 합산·기록·형식 확인). 한 번에 3개까지, 센 수만큼 차감. 4개 이상·남은 횟수 초과는 반려, 알 수 없으면 되묻기(둘 다 차감 없음, 단 연속 3번 뒤 다음 응답은 1회 차감). 메인 모델은 반려·되묻기면 부르지 않고, 답할 때 1회(답변 검증 반려 시에만 재생성).
- **방 관리:** `player` 쿠키(한 번 발급)로 사람당 진행 중 방 2개, 같은 접속 IP당 7개(`ip_hash`: IP의 SHA-256 해시, 원문 저장 안 함), 전체 30개(`MAX_ACTIVE_ROOMS`)를 서버 기록으로 센다(모두 429 + 선택 필드 `code`: `player_rooms_full` / `ip_rooms_full` / `rooms_full`). 접속 IP 자체는 막지 않는다(운영 `ALLOWED_IPS` 비움, 2026-11-25). 마지막 요청 후 15분이면 요청 때 차단(만료) 기록, 질문·제출·조사는 410 + `closed`, 새 게임만 가능. 방 기록은 지우지 않는다. 새 게임의 분당 제한(`GAME_CREATE_LIMITER`)은 호출하지 않는다. `ALLOWED_IPS`(쉼표 구분, 비면 제한 없음)가 있으면 Worker 입구에서 403.
- **비공개 정보:** 최종 제출 전에는 역할 배정(A~D), 사실 태그(`facts`), 해금 상태, 판정 점수·집계(`tally`)를 브라우저에 보내지 않는다. 힌트 속마음에는 단서 이름·사실 내용·위치·인물·정답 확인 표현을 넣지 않는다(테스트가 검사). 단서 카드(`clues`)는 찾기 전에 브라우저로 가므로 제목·내용에 범인 이름을 넣지 않는다(`build` 카드 참고). `publicTurn()` 반환 필드를 바꾸면 유출 여부를 확인한다. 범인 역할은 D지만 사람과 역할 배정은 게임마다 바뀐다.
- **멱등성·동시성:** 클라이언트 `requestId`, `requests` 테이블의 `fingerprint`, `games.revision` + `db.batch()` 원자 저장을 제거하지 않는다.
- **스키마 변경:** 기존 마이그레이션을 고치지 말고 번호를 올린 새 파일로 추가하고, 데이터 보존·롤백을 검토한다. 새 코드는 `0003`~`0005`가 적용된 D1에서만 동작한다(운영 적용 완료).
- 화면 전용 상태(찾은 단서, 메모, 연필 선 등)는 `localStorage`에 있고 D1로 옮겨지지 않았다.

## 5. 아직 검증되지 않은 것 (완료로 가정하지 않는다)

- 운영의 실제 모델 비용·시간 제한·동시 접속 부하. 2026-11-25부터 운영은 OpenAI 모드(Secret 등록, 월 한도 미설정), 운영에서 질문 2개 정상 답변만 확인. 로컬 Worker에서 OpenAI 호출은 확인함(`npm run dev:ai`, `AI_REDESIGN_DECISIONS.md` 12.5~12.6). Gemini 구조화 출력은 미확인.
- 해금 판정 정확도는 평가 세트 17개로만 확인(오해금 1건 경계 사례). 배정·NPC별 확대 평가 필요.
- 15분 만료의 운영 동작(로컬 대역 테스트만). 방 수 제한은 운영에서 같은 IP 8번째 방 429까지 확인(2026-11-25).
- 질문 API 동시 경합 시 409 대신 500이 나올 가능성.
- GitHub push 시 자동 배포 (현재는 CLI 수동 배포).
- 팀원별 Cloudflare 계정 권한 부여.

## 6. 참고

- 줄바꿈: 일부 기존 파일은 CRLF다. 수정할 때 파일 전체의 줄바꿈을 바꾸지 않는다.
- 게임 규칙·캐릭터 설계 배경: `docs/game/ARCHITECTURE.md`, `docs/game/HANDOFF.md`, `docs/game/INTEGRATION.md`.
