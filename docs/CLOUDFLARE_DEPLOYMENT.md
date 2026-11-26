# GotBong — Cloudflare 배포 및 팀 개발 가이드

> 문서 기준일: 2026-11-25
> 현재 공개 버전: **OpenAI 실제 모델** (2026-11-25 `OPENAI_API_KEY` Secret 등록, 월 사용 한도 미설정), 모든 IP 접속 가능, **같은 IP당 진행 중 방 7개**
> 배포 주소: <https://gotbong.aleph26.workers.dev/>
> 저장소: <https://github.com/CatchBong-ALEPH26/GotBong>

## 1. 프로젝트 실행 환경

GotBong은 **Cloudflare 중심 단일 구조**입니다. 로컬 개발도 운영과 같은 Worker 코드를 Vite 개발 서버로 실행합니다. (예전 Node.js AI 서버 + SQLite 경로는 2026-11-22 `refactor/cloudflare-first`에서 제거했습니다.)

| 구분 | 로컬 개발 | Cloudflare 배포 |
| --- | --- | --- |
| 웹 + API | `npm run dev` → vinext/Vite (`http://localhost:3000`) | vinext / Cloudflare Workers |
| API 라우트 | `app/api/{session,question,submit,reset,investigate}/route.js` | 동일 |
| 속도 제한 | 바인딩 없음 → 제한 안 함 | `GAME_CREATE_LIMITER`: 새 게임 생성 IP당 1분 10번 |
| 예약 작업 | `/cdn-cgi/local/explorer/api/local/scheduled?worker=gotbong` (POST, `{"cron":"0 4 * * *"}`)로 직접 실행 | 매일 04:00 UTC, 7일 지난 빈 게임 정리 (`worker/index.js`) |
| 데이터 | 로컬 D1 시뮬레이션 (`.cloudflare/state`, Git 제외) | Cloudflare D1 `gotbong-dev` |
| 모델 | API 키 없으면 Fixture | OpenAI (메인 gpt-4.1, 빠른 모델 gpt-4.1-mini) |

**중요:** Cloudflare에 배포된다고 해서 GitHub 저장소가 자동 갱신되지는 않습니다. 반대로 GitHub에 코드를 푸시하더라도 현재 수동 배포 방식에서는 Cloudflare에 자동 반영된다고 가정하지 마세요.

## 2. 팀 Cloudflare 리소스

| 항목 | 값 |
| --- | --- |
| Cloudflare 계정 프로필 | `gotbong-team` |
| Cloudflare 계정 ID | `4bbbe34b2ec252adec082f1803c41a78` |
| Worker 이름 | `gotbong` |
| Workers 도메인 | `gotbong.aleph26.workers.dev` |
| D1 데이터베이스 | `gotbong-dev` |
| D1 데이터베이스 ID | `215068c4-cd09-4933-9f86-460b937a13b5` |
| Worker의 DB 바인딩 | `env.DB` |
| 배포에 사용한 CLI | `cf v1.0.0-rc.2` |
| 마지막 확인 배포 버전 ID | `7a69a667-21de-412b-8a5f-914bf215780d` (2026-11-26, 필수 근거 G4·찾은 단서 서버 기록·프롬프트 누설 방지, `0006` 적용 후 배포. 운영 확인: 찾지 않은 단서 400, 조사 기록, 실제 AI 답변 약 6.5초). 그 전: `56d408b8-28de-4bc4-b5fd-e5738b4a8e64` (2026-11-25, 같은 IP당 방 7개, 마이그레이션 `0005` 적용 후 배포). 직전: `2c8efadc-…` (해금 판정 재설계·질문 차감·속마음 힌트·방 관리, `0003`·`0004`) |

팀원이 배포에 참여하려면 **GitHub 저장소 접근 권한**과 **GotBong Team Cloudflare 계정 권한**을 각각 받아야 합니다. 두 권한은 별도입니다.

> **리소스 혼동 주의:** 기존 개인 Cloudflare 계정의 D1도 `gotbong-dev`라는 이름을 사용한 이력이 있습니다. 기존 개인 계정 D1 ID는 `0737af8d-700c-46ec-a791-2221fc583a8e`입니다. 팀 계정 D1과 다른 데이터베이스이며, **이전 리소스를 삭제·초기화·수정하지 않습니다.**

## 3. 로컬 개발 (Windows PowerShell)

```powershell
# git clone https://github.com/CatchBong-ALEPH26/GotBong.git ; cd GotBong
npm.cmd ci
npm.cmd run db:migrate:local   # 처음 한 번. 반드시 --local (스크립트에 포함). 운영 D1에는 쓰지 않는다
npm.cmd run dev                # http://localhost:3000
```

- 로컬 D1 데이터는 `.cloudflare/state/`에 저장됩니다(Git 제외). 초기화가 필요하면 이 폴더만 지우고 `db:migrate:local`을 다시 실행합니다. 운영 D1 초기화와 혼동하지 마세요.
- API 확인: `curl.exe -i http://localhost:3000/api/session` → `200`, `Set-Cookie: game=...`(HttpOnly, SameSite=Strict), `mode: "fixture"`, `remaining: 20`.
- 테스트: `npm.cmd test` → `test/game.test.mjs`(게임 규칙) + `test/api.test.mjs`(Workers API 계약: 쿠키·멱등성·revision·비공개 정보, `node:sqlite`로 만든 D1 대역 사용). 실제 Cloudflare·AI 호출은 없습니다.
- 실제 모델 품질 평가: `.env.example`을 `.env`로 복사해 키를 넣고 `npm.cmd run eval -- --quick` (**유료 호출**, 팀 합의 후).
- 로컬 Worker에서 실제 AI 키 쓰기(2026-11-25 확인): `.dev.vars`에 `OPENAI_API_KEY=...`를 넣고 `npm.cmd run dev:ai` (유료 호출). 로컬 런타임은 선언된 비밀 값만 채우므로 `GOTBONG_LOCAL_AI=1`일 때만 선언하도록 `cloudflare.config.ts`에 넣었습니다. 키는 채팅·스크린샷·Git에 노출하지 마세요.
- **운영 D1 스키마:** 코드는 `migrations/0003_question_tally.sql`, `0004_rooms.sql`, `0005_room_ip.sql`, `0006_clues_found.sql`이 적용된 D1에서만 동작합니다. `0006`(찾은 단서 기록)은 2026-11-26 운영 적용(적용 전 Time Travel 복구 지점 `0000002f-00000000-0000512f-9b984516f1a09fa74b932027203ac7a7`, 기록 수 전후 동일: 게임 38, 턴 69, 요청 90). `0003`~`0005`는 운영 D1에 2026-11-25 적용 완료(열·인덱스 추가만, 기존 기록 보존, 적용 전 Time Travel 복구 지점 기록: `docs/game/AI_REDESIGN_DECISIONS.md` 12.8). 접속 IP를 막는 `ALLOWED_IPS`(쉼표 구분)는 지금 비워 두었고, 전체 동시 방 상한은 `MAX_ACTIVE_ROOMS`(기본 30)로 등록합니다. 근거: `docs/game/AI_REDESIGN_DECISIONS.md` 12.8.

## 4. Cloudflare 계정 연결 및 배포

### 4.1. 사전 확인

1. Cloudflare 관리자가 팀 계정에 접근 권한을 부여했는지 확인합니다.
2. 저장소의 `cloudflare.config.ts`에 연결된 D1 ID가 **팀 D1 ID**와 일치하는지 확인합니다.
3. 배포 전 변경 사항과 비밀정보 포함 여부를 검토하고, 팀 작업 규칙에 따라 리뷰/승인을 받습니다.
4. 새 데이터베이스를 만들거나 기존 데이터베이스를 삭제하지 않습니다.

처음 팀 프로필을 만드는 PC에서는 프로젝트에서 사용한 CLI의 안내에 따라 인증합니다.

```powershell
npx.cmd cf auth create gotbong-team
npx.cmd cf auth activate gotbong-team
```

이미 프로필이 있다면 활성화만 하면 됩니다. CLI 버전에 따라 인증 절차의 대화형 안내가 달라질 수 있습니다.

### 4.2. 빌드

```powershell
npm.cmd run build
```

`Build complete` 및 `/api/question`, `/api/reset`, `/api/session`, `/api/submit` 네 라우트가 표시되는지 확인합니다.

### 4.3. 배포

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "4bbbe34b2ec252adec082f1803c41a78"
npx.cmd cf deploy               # 또는 npm.cmd run deploy (같은 명령)
```

**새 PowerShell 창을 열었다면 계정 ID 환경변수를 다시 지정하세요.** 배포 로그에서 다음 내용을 확인해야 합니다.

```text
Active profile: gotbong-team
...
env.DB (gotbong-dev)          D1 Database
...
https://gotbong.aleph26.workers.dev
...
Deploy complete
```

다른 계정이나 다른 D1 리소스가 보이면 배포를 계속하지 말고 팀 관리자에게 확인하세요. `No updated asset files to upload`는 정적 자산 변경이 없을 때 정상적으로 나타날 수 있습니다.

## 5. D1 스키마와 데이터 보존

D1 마이그레이션 파일:

- `migrations/0001_initial.sql`: 기본 게임 데이터 테이블 초기화
- `migrations/0002_game_revision.sql`: 게임 상태 버전 관련 확장

**현재 팀 D1에는 두 마이그레이션이 이미 적용되어 있습니다.** 기존 팀원이 새로 배포한다고 해서 이 SQL을 다시 실행할 필요가 없습니다. 신규 마이그레이션을 만들 경우 적용 대상 계정, 기존 테이블과 데이터에 미치는 영향, 백업/복구 방법을 먼저 검토해야 합니다.

게임 기록은 D1에 저장되며, 새 게임을 시작해도 이전 게임 기록을 삭제하지 않는 방식입니다. 데이터베이스에 대한 `DROP`, `DELETE`, 초기화 명령은 팀의 별도 합의 없이 실행하지 않습니다.

## 6. 환경변수와 AI 모델

**현재 운영 상태 (2026-11-25):** Worker Secrets에 `OPENAI_API_KEY`를 등록했습니다(`cf workers secrets update <이름> --worker gotbong --type secret_text`, 값은 저장소에 쓰지 않음). `cf deploy`는 기존 Secrets를 유지하므로(`keepSecrets`) 다시 배포해도 지워지지 않습니다. 운영에서 질문 2개로 실제 답변(한 번에 5~6초)을 확인했습니다. 접속 IP는 막지 않고(`ALLOWED_IPS` 삭제), 대신 **같은 접속 IP에서 동시에 진행 중인 방을 7개까지**로 제한합니다(사람당 2개·전체 30개와 함께, 8번째는 429 `ip_rooms_full`, 운영에서 확인).

- **비용 주의:** 질문 한 번에 OpenAI 호출 2~3회(판정·답변·검증). 키의 월 사용 한도는 아직 설정하지 않았으니 OpenAI 결제 설정에서 정하세요.
- **같은 IP당 방 수 바꾸기:** `lib/server/game-http.mjs`의 `ROOM.MAX_PER_IP`(지금 7)를 고쳐 배포합니다.
- **접속 IP 자체를 막고 싶을 때:** 같은 명령으로 `ALLOWED_IPS`를 쉼표 구분 목록(IP 또는 IPv4 CIDR)으로 등록합니다. 지우면(`cf workers secrets delete ALLOWED_IPS --worker gotbong --force`) 제한이 없습니다.
- **Fixture로 되돌리기:** `OPENAI_API_KEY` Secret을 지우면 다음 요청부터 Fixture 모드입니다.

- `app/api/session/route.js`: 선택된 AI `mode` 응답
- `app/api/question/route.js`: `modelFromEnv(env)`로 모델 선택
- `app/api/submit/route.js`: 정답 용의자의 범행 동기 채점 시 모델 선택
- `app/api/reset/route.js`: 선택된 AI `mode` 응답

향후 실제 OpenAI·Gemini를 사용할 때에는 API 키를 **Cloudflare Secrets**로 등록하고, 키 권한·요금·모델 선택·Workers 런타임 호환성을 별도로 검증해야 합니다. `.env` 파일이나 `cloudflare.config.ts`, GitHub 코드에 실제 키를 직접 넣지 않습니다. Gemini 경로는 운영에서 검증하지 않았습니다.

## 7. 배포 확인 체크리스트

2026-11-22 기준, 공개 배포본에서 아래 5개 핵심 기능을 직접 확인했습니다.

- [x] 새 사건 정상 생성
- [x] NPC 질문 응답 및 질문 횟수 차감
- [x] 새로고침 후 대화 기록 유지
- [x] 범인 지목 후 사건 보고서 표시
- [x] 새 게임으로 초기화

이 체크리스트는 Fixture 모드 기준입니다. 실제 AI 모델, 동시 요청 충돌, 장애 상황/오류 복구는 후속 검증 대상입니다.

## 8. GitHub 반영 절차

변경 사항이 실제 배포에 반영되어도 GitHub에는 별도로 커밋·푸시해야 합니다.

```powershell
git status --short --branch
git diff --cached --name-status
git diff --cached --check
```

스테이징된 파일에 `.env`, 키 문자열, 로컬 D1 상태(`.cloudflare/`), 개인 계정에 연결된 잘못된 설정이 없는지 **내용까지 확인**하세요. 이후 팀 규칙에 따라 커밋하고, 허용된 방식으로 `main`에 반영하거나 Pull Request를 만듭니다. 보호된 브랜치에서는 직접 푸시하지 않습니다. `--force` 푸시는 사용하지 않습니다.

서버 코드 위치: `app/api/` 아래 API 5개, `worker/index.js`(진입점·예약 작업), `lib/server/`(`db-d1.mjs`, `game-http.mjs`), `lib/game/`(게임 규칙·`data/` 시나리오), `lib/ai/`(모델·질문 파이프라인), `migrations/`, `cloudflare.config.ts`.

## 9. 문제 해결

| 증상 | 먼저 확인할 내용 |
| --- | --- |
| `localhost:3000` 사용 중 | 다른 개발 서버가 실행 중인지 확인 |
| 로컬에서 `/api/session`이 500 (`no such table`) | `npm.cmd run db:migrate:local`을 먼저 실행 |
| Cloudflare에서 게임 생성 오류 | `env.DB` 바인딩, 팀 D1 선택 여부, 마이그레이션 적용 상태 점검 |
| 다른 Cloudflare 계정으로 배포 시도 | 활성 프로필 `gotbong-team`, `CLOUDFLARE_ACCOUNT_ID` 확인 |
| AI가 정형화된 답변만 반환 | Fixture 모드. `/api/session`의 `mode`와 `OPENAI_API_KEY` Secret 등록 여부 확인 |
| 접속하면 403 안내만 보임 | `ALLOWED_IPS` Secret이 등록돼 있고 지금 접속 IP가 없음. 목록을 고치거나 Secret을 지움 |
| 새 사건이 "여러 명이 수사 중" 안내로 안 열림 | 같은 IP에서 진행 중인 방 7개. 누가 제출하거나 15분 쉬면 풀림 |
| 빌드의 `SOURCEMAP_BROKEN` 경고 | 기존 빌드에서도 나타난 비치명적 경고이며, 오류와 구별하여 최종 `Build complete` 확인 |
| `HTTP 502`로 모델 호출 실패 | 실제 AI 모델 설정 및 키/제공자 오류를 점검 (키 값은 공유하지 않음) |

## 10. 공동 작업 시 유의 사항

- 팀 Cloudflare 계정 및 D1만 사용합니다. 개인 계정 리소스는 건드리지 않습니다.
- 다른 팀원이 사용 중일 수 있는 D1 게임 기록을 임의로 삭제하지 않습니다.
- AI 키 등록은 추후 관리자와 별도 협의합니다.
- 배포 전 변경 사항을 리뷰하고, 완료 후 배포 URL과 버전 ID, 테스트 결과를 기록합니다.
- 이 문서는 확인된 배포 절차를 기준으로 작성했습니다. CLI·Cloudflare 설정이 바뀌면 실제 결과를 기준으로 업데이트합니다.
