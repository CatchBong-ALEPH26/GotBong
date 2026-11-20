# GotBong 화면 ↔ AI 서버 통합 안내

> 작성: 2026-11-20 · 대상: GotBong UI 담당자
> AI 서버 전체 API와 기능 설명은 [`HANDOFF.md`](HANDOFF.md)에 있다. 이 문서는 **지금 GotBong 코드(`lib/mock/useMockGame.ts`, `lib/view/types.ts`)에 어떻게 붙이는지**만 다룬다.

---

## 1. 먼저 팀이 정해야 할 것

AI 서버는 **최소 MVP 개발 기획서 / 초간단 기획서**를 기준으로 만들었다. GotBong 화면은 **규칙 v2 / 시나리오 개정판**을 기준으로 만들어서 아래 항목이 서로 다르다. 각 항목을 어느 쪽에 맞출지 정해야 연결 작업 범위가 정해진다.

| # | 항목 | AI 서버 (MVP) | GotBong 화면 (개정판) | 권장 |
|---|---|---|---|---|
| 1 | 역할 배정 | 게임마다 무작위 (24가지) | 고정: 봉경 A, 원 C, 건희 D(범인) | **서버 방식.** 팀원이 직접 플레이해도 범인을 미리 모른다 |
| 2 | 피해자 | 팀원 외 22명 중 무작위, 심문 불가 | 황윤찬 (용의자 목록에 포함) | 서버 방식. 용의자 4명이 모두 심문 대상이 된다 |
| 3 | 화면의 A·B·C·D 글자 | 보내지 않음 (정답 유출) | `PublicSuspect.letter`로 표시 | 글자 표시 제거, 이름만 표시 |
| 4 | 단서 | 시작 단서 5장 전부 공개 | 장면 클릭으로 9장 발견 | 화면 연출은 유지 가능 (§3.2) |
| 5 | 키보드 테스트 | 없음 (MVP에서 제외) | 있음 | 제외하거나, 서버에 추가 개발 필요 |
| 6 | 동기 제출 | 자유 서술 + AI 채점 | 보기 중 선택 (`motiveId`) | 기획서 기준은 자유 서술 |
| 7 | 결과 | 1 / 0 | win / partial / lose | 기획서 기준은 1 / 0 |
| 8 | 진행 방식 | 1인, 시간 제한 없음 | 방·여러 명·20분 타이머·폴링 | 기획서 기준은 1인, 시간 제한 없음 |
| 9 | 질문 길이 | 최대 500자 | 최대 100자 | 화면 100자 유지해도 문제없음 |

기획서 우선순위(최소 MVP 기획서 → 초간단 기획서 → 시나리오 v5)를 따르면 대부분 서버 쪽이 기준이다. 다만 화면 연출(장면 클릭, 수첩, 사건 순서 메모)은 서버와 무관하게 **화면 안에서만** 유지할 수 있다.

---

## 2. 실행 구성 (같은 출처로 묶기)

AI 서버는 쿠키(`SameSite=Strict`)로 게임을 구분하므로 **화면과 API가 같은 주소에서 나가야 한다.** Next 개발 서버가 `/api/*`를 AI 서버로 넘겨주게 한다.

```ts
// next.config.ts
const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:3001/api/:path*" }];
  },
};
```

```powershell
# 터미널 1: AI 서버
cd ai-server
Copy-Item .env.example .env      # OPENAI_API_KEY 입력, PORT=3001 추가
npm.cmd start                    # http://127.0.0.1:3001  [openai] …

# 터미널 2: 화면
npm.cmd run dev                  # http://localhost:3000
```

- AI 서버는 npm 패키지 의존성이 없다 (`npm install` 불필요, Node 24 이상).
- 루트 `npm run lint`가 `ai-server/`까지 검사하지 않도록 `eslint.config.mjs`의 `ignores`에 `"ai-server/**"`를 추가하는 것을 권장한다.
- 키가 없으면 테스트 모드(고정 응답)로 뜬다. 화면 흐름만 확인할 때 쓴다.

---

## 3. `useMockGame` → 실제 API 대응표

`GameActions` 인터페이스는 그대로 두고, 내부만 `fetch`로 바꾸는 것을 기준으로 적었다.

### 3.1 상태 불러오기

| GotBong | AI 서버 |
|---|---|
| `initial(code)` / 폴링 | `GET /api/session` (1인용이라 폴링 불필요. 처음 한 번과 새로고침 때만) |
| `start`, `beginInvestigation` | 서버 호출 없음 (화면 상태만) |
| 새 게임 | `POST /api/reset` (배정·피해자가 새로 바뀜) |

`GET /api/session` → `GameView` 변환:

| GameView 필드 | 채우는 법 |
|---|---|
| `scenario.intro` | `intro` (여러 줄) |
| `scenario.suspects` | `npcs` 순서대로 `{ id: npc.id, name: npc.name, role: npc.summary, letter: (표시 안 함), keyboard: … }` |
| `suspects[].portraits/sprites` | 그림 파일을 **사람 ID**(`kim`, `hwangyc`, `won`, `hwanggh`) 기준 이름으로 바꾼다. 지금의 `a/b/c/d` 파일명은 역할 기준이라 무작위 배정과 맞지 않는다 |
| `suspects[].keyboard` | 서버가 보내지 않는다. 단서 "낯선 수신기" 본문에 무선 키보드 사용자 이름이 있다 |
| 피해자 | `victim` (이름 문자열). 용의자 목록에는 넣지 않는다 |
| `evidence` (현장 단서) | `clues` 5장 → `{ id, kind: "scene", name: title, text: detail }` |
| `messages` | `turns` → 아래 §3.3 변환 |
| `me.questionsUsed` | `maxQuestions - remaining` |
| `config.generalQuestions` | `maxQuestions` (20) |
| `report` | `result` → §3.4 |

### 3.2 `investigate(spotId)` — 현장 조사

서버 호출이 없다. 단서 5장은 처음부터 공개된 정보이므로, 화면의 장면 클릭으로 "발견"하는 연출은 **화면 안에서** 처리하면 된다. 핫스폿을 서버 단서 ID에 연결한다.

| 서버 단서 ID | 내용 | GotBong 핫스폿 후보 |
|---|---|---|
| `trash` | 사라진 프로그램 + 휴지통 09:56 | 피해자 모니터 (c1·c2) |
| `receiver` | 낯선 수신기 + 무선 키보드 사용자 | 본체 뒤 (c3·c4) |
| `source` | 소스 열람 09:47 | 피해자 PC 파일 기록 |
| `build` | {범인}의 빌드 기록 | 범인 책상 모니터 (c9). **배정이 매번 바뀌므로 "누구 책상인지"는 단서 제목의 이름을 써야 한다** |
| `chat` | 단체 대화방 09:30 | 대화 기록 (c8) |

### 3.3 `ask({ suspectId, question, clueId })` — 심문

```ts
POST /api/question
{ npc: suspectId, question, requestId: crypto.randomUUID(),
  attach: clueId ? toAttach(clueId) : undefined }
```

| GotBong `clueId`가 가리키는 것 | `attach` |
|---|---|
| 현장 단서 (`trash` 등) | `{ type: "clue", id: clueId }` |
| 다른 사람의 증언 | `{ type: "turn", id: <그 답변의 turn.id> }` |

**증언을 증거로 쓰는 방식이 다르다.** GotBong은 서버가 판정한 증언만 수첩에 들어오는 구조(`newEvidenceIds`)다. AI 서버는 **다른 사람의 답변 어느 것이든** 증거로 내밀 수 있다. 서버가 그 답변에 실제로 담긴 사실을 기억해 두고 해금을 판정한다. 그래서 화면에서는 다음과 같이 처리하는 것을 권장한다.
- 답변 문장을 누르면 수첩에 "진술"로 꽂는 기존 `pinNote` 흐름을 쓴다.
- 진술을 내밀 때는 그 진술이 나온 답변의 `turn.id`를 `attach`로 보낸다.

응답 → `Message` 변환:

| 응답 | Message |
|---|---|
| `status: "accepted"` | `answer: turn.reply`, `emotion: map(turn.emotion)`, `charged: true` |
| `status: "clarify"` / `"rejected"` | `answer: ""`, `charged: false`, `notice: message` (입력 유지) |
| HTTP 4xx/5xx | `error` 문구 표시, 차감 없음. 502(AI 오류)는 **같은 requestId로** 재시도 |
| `newEvidenceIds` | 빈 배열 (서버가 증언 목록을 따로 만들지 않음) |

표정 이름 변환: `기본 → neutral`, `당황 → flustered`, `화남 → angry`, `웃음 → smile`

응답에 2~4초가 걸린다(실측 중앙값 2.1초). 기존 `wait(900)` 자리에 "생각 중…" 표시를 유지한다.

### 3.4 `accuse` — 최종 제출

```ts
POST /api/submit  { npc: suspectId, motive: "자유 서술 문장", requestId }
→ { result: { score: 0 | 1, truth, cast: [{ npc, name, role, title }] } }
```

- 1회만 가능하다. 제출 전 확인 창이 필요하다.
- `motiveId`(보기 선택)를 유지하려면 보기의 `label` 문장을 그대로 `motive`로 보내면 된다. AI 채점이 뜻을 비교한다. 다만 기획서 기준은 자유 서술이다(§1-6).
- 동기 채점이 실패하면 0점이 아니라 HTTP 502가 온다. 재시도하게 한다.
- `ReportView` 변환: `verdict = score ? "win" : "lose"`, `truth = result.truth`, 배정 공개는 `result.cast`. 타임라인과 핵심 증거 목록은 서버가 보내지 않는다(필요하면 서버에 추가).

### 3.5 서버에 없는 것

| GotBong 기능 | 상태 |
|---|---|
| 키보드 테스트 | 없음. 넣기로 하면 서버에 해금 원자 `clue:test_D` 같은 형태로 추가 개발 필요 |
| 방·여러 명·대기실·다른 플레이어 현황 | 없음 (기획서: 1인) |
| 20분 타이머 | 없음 (기획서: 시간 제한 없음). 화면에서만 재는 것은 가능 |
| `notes`, `contradictions` 저장 | 없음. 화면의 `localStorage`로 충분 |
| 추천 질문 (`suggestions`) | 없음. 화면에 고정 문구로 둘 수 있다 |

---

## 4. 반드시 지킬 것

1. 사용자·AI 문자열은 React가 기본으로 이스케이프하므로 `dangerouslySetInnerHTML`만 쓰지 않으면 된다.
2. 게임이 끝나기 전에는 역할(A~D)을 어디에도 표시하지 않는다.
3. `requestId`는 질문마다 새로 만들고, 오류 뒤 같은 내용을 재시도할 때만 재사용한다.
4. 요청 중에는 질문·제출 버튼을 잠근다 (동시 요청은 409).
5. 디버그 모드(`DEBUG=1`)는 정답이 보이므로 시연 때는 끈다.
