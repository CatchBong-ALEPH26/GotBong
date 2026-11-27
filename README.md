# GotBong · 방과후 탐정단 — AI 추리게임

16비트 픽셀 측면 어드벤처(팀 확정안 **D**) 화면 + AI 용의자 게임 API. 1인용. 범인·역할·피해자는 게임마다 무작위로 바뀐다.
화면과 API(`app/api/*`)는 vinext로 **하나의 Cloudflare Worker**에서 돌고, 게임 기록은 Cloudflare D1에 저장한다.

## 실행 (Node 24 이상, 터미널 1개)
```powershell
npm install
npm run db:migrate:local      # 처음 한 번: 로컬 D1(.cloudflare/state)에 테이블 생성. 운영 D1은 건드리지 않음(--local)
npm run dev                   # http://localhost:3000 → 사건 시작
npm test                      # 게임 규칙 + API 계약 테스트 (실제 AI·Cloudflare 호출 없음)
```

### 로컬 Worker에서 실제 AI 키 쓰기 (유료 호출, 팀 합의 후)
로컬 개발 런타임은 Worker 설정에 **선언된 비밀 값만** `.dev.vars`에서 채운다. 그래서 키 파일만 두고 `npm run dev`를 하면 테스트 모드 그대로다.
```powershell
Set-Content .dev.vars "OPENAI_API_KEY=<키>"   # .dev.vars 는 Git 제외. 채팅·문서·커밋에 키를 쓰지 않는다
npm run dev:ai                                 # GOTBONG_LOCAL_AI=1 로 비밀 값을 선언하고 개발 서버 실행
```
오른쪽 위 "테스트 모드" 표시가 사라지고 `/api/session`의 `mode`가 `openai`면 연결된 것이다. 평소 `npm run dev`·빌드·배포에는 선언이 들어가지 않는다(`cloudflare.config.ts`).
해금 판정만 따로 재 보려면 `.env`에 같은 키를 두고 `node --env-file=.env scripts/judge-probe.mjs --max-calls=20` (결과: `docs/game/eval/judge-probe-*.md`), 캐시 적중은 `scripts/cache-probe.mjs`. 실제 호출은 모두 장부 `docs/game/eval/ai-calls.jsonl`에 남고 누적 상한(`AI_CALL_BUDGET`, 기본 60)에서 멈춘다. **자동 테스트는 실제 AI를 부르지 않는다.**
키가 없으면 오른쪽 위에 "테스트 모드"가 뜨고 고정 응답(Fixture)이 온다. 배포·운영 D1·AI 키 정책은 [`docs/CLOUDFLARE_DEPLOYMENT.md`](docs/CLOUDFLARE_DEPLOYMENT.md).

## 조작
| 조작 | 하는 일 |
|---|---|
| 시작 영상 → 수사 시작 | 사건 안내 설명을 장면과 자막으로 보여 주는 약 35초 영상(건너뛸 수 없음, 다른 탭에 가 있으면 멈춤): 크롬을 누름 → 파일이 잠기고 배경 화면이 안내문으로 바뀜 → 점심시간과 용의자 4명. 끝나면 규칙 카드. 사건 개요는 수첩에서 다시 볼 수 있다. 시간 제한 없음 |
| 장면의 물건 누르기 | 조사(질문 소모 없음). 표시는 없다. 현장 단서 4장을 찾는다: 강사님 모니터(크롬 바로가기 속성, USB 접속 기록), 키보드 옆 USB, 벽의 멘토링 신청표. 찾은 단서는 모니터 창·종이·실물 모양으로 크게 보여 준다 |
| 대화로 얻는 것 | 단서 5(스마트폰 메시지)와 증언 속 자료(영수증, 자습실 이용 기록, 제출 알림, 저장 기록)는 대화 중에 상대가 보여 준다. 대사창 위에 물건 모양 카드로 뜨고, 단서는 수첩 단서 노트에, 자료는 대상별 기록에 남는다 |
| 사람 누르기 | 그 사람이 가운데 서고 질문 입력(최대 500자). 한 번에 3개까지 묻고, 물은 개수만큼 남은 질문이 준다(4개 이상·남은 횟수 초과는 차감 없이 다시 묻기). 증거 내밀기: 단서 카드 또는 **다른 사람의 말**. 같은 실수를 3번 하면 탐정의 속마음 힌트가 한 번 나온다 |
| 단서 n/5 (위쪽) | 모은 단서 수. 누르면 "어디를 볼지" 혼잣말 힌트(같은 단서를 다시 누르면 더 구체적으로). 오래 막히면 반짝이고, 100초가 지나면 힌트가 저절로 나온다 |
| 소리 버튼 (위쪽 끝) | 효과음·배경음 켜고 끄기. 처음엔 꺼져 있고 이 브라우저에 기억한다. 소리는 파일 없이 `lib/audio/sound.ts`에서 만든다 |
| **수첩** (N) | 단서 노트 / 대상별 기록 / 사건 순서 / 최종 추리(범인 + 동기 자유 서술, 1회 제출) |
| 보고서 | 해결/미해결 도장, 범인·동기 ○/×, 등급(서버가 주면 S/A/B/C, 없으면 쓴 질문 수로 매긴 칭호), 진상, 모은/놓친 단서, 기록에 남은 시각, 밝혀낸 모순, 그날의 역할. "새 게임"이면 범인이 바뀐다 |

## 데이터 흐름
- `lib/api/useGame.ts` — 게임 API(`docs/game/HANDOFF.md` §3)를 화면 데이터(`lib/view/types.ts`)로 바꾼다. 실패한 요청은 같은 `requestId`로 재시도한다.
- `lib/scene/classroom.ts` — 장면 좌표, 누를 수 있는 곳, 단서 카드의 형태·그림(화면 담당). 역할 기준 정보는 없다.
- `lib/preview/ransomware.ts` — **화면 미리보기용 가짜 서버.** 서버가 아직 예전 사건을 주는 동안에만 켜지고(위쪽에 "화면 미리보기" 표시), 랜섬웨어 사건의 소개·단서·자료를 임시로 채운다. 대답은 자리 표시 문장이다. 서버가 새 사건(단서 id `usblog` 등)을 주면 자동으로 꺼진다. 파일 머리말에 서버에 요청하는 응답 모양이 적혀 있다.
- 장면에서 찾은 단서, 밑줄, 연필 선, 내가 낸 답은 브라우저 `localStorage`에만 둔다(서버 판정과 무관).
- 연결 안내와 팀 결정 사항: `docs/game/INTEGRATION.md` (Node 서버 시절 기록)
- 서버 쪽: `app/api/{session,question,submit,reset,investigate}/route.js` (진입점 `worker/index.js`: IP 허용 목록) → `lib/server/`(D1·HTTP 공통·방 관리) · `lib/game/`(배정·상태 기계·해금 점수·시나리오 `data/`) · `lib/ai/`(Fixture/OpenAI/Gemini, 질문 파이프라인: 해금 판정 → 메인 모델 1회 → 답변 검증)
- 해금 판정·질문 차감·속마음·방 관리 규칙: [`docs/game/AI_REDESIGN_DECISIONS.md`](docs/game/AI_REDESIGN_DECISIONS.md)
- 방: 사람당 진행 중 2개, 같은 접속 IP당 7개(한 공인 IP를 쓰는 곳에서 동시에 플레이할 PC 수), 전체 30개, 마지막 요청 후 15분이면 만료(기록은 남고 새 수사만 가능). 접속 IP 자체를 막는 `ALLOWED_IPS`는 운영에서 비워 둠(비면 제한 없음)

## 파일
| 영역 | 파일 |
|---|---|
| 타이틀, 게임, 보고서 | `app/page.tsx`, `app/play/page.tsx`, `components/Report.tsx` |
| 진행 화면 조립 | `components/game/GameScreen.tsx` |
| 장면(보이지 않는 클릭 영역), 클로즈업, 단서·자료 카드, 시작 영상 | `Stage.tsx`, `Closeup.tsx`, `ClueCard.tsx`, `IntroScreen.tsx` |
| 위쪽 표시, 대사창 | `Hud.tsx`, `DialogBox.tsx`, `PinnableText.tsx` |
| 증거 고르기, 수첩(증거·대상별 기록 포함) | `EvidenceBag.tsx`, `Notebook.tsx` |
| 픽셀 UI 부품 | `components/pixel/*` (픽셀 아이콘, 초상, 배경) |
| 스타일 | `app/globals.css` |
| 글꼴 | `app/fonts/` 갈무리(Galmuri), SIL OFL 1.1 |

## 그림 바꾸기
지금 그림은 Codex로 만든 **임시 그림**입니다. 같은 이름의 파일로 바꾸면 그대로 적용됩니다.
- 배경: `public/game/scenes/classroom.png` (1536×864, 긴 책상 2줄·왼쪽 4자리 오른쪽 3자리, 창문·게시판 없음. 그림 지시문 `docs/design/drafts/briefs/ransomware-classroom.md`). 바꾸면 `lib/scene/classroom.ts`의 `hotspots`, `people` 좌표(% 단위)도 맞춘다.
- 지금 그림엔 빈 피해자 자리가 없어 오른쪽 뒤 책상(원래 강사님 책상)을 피해자 자리로 쓴다. 다시 그릴 때 빈 자리를 넣는 것을 권장.
- 초상·상반신: `public/game/{portraits,sprites}/{kim,hwangyc,won,hwanggh}-{neutral,flustered,angry,smile}.png` (서버의 사람 ID 기준)
- 단서 아이콘: `public/game/items/gk-*.png`
- 사건 그림: `public/game/case/ransom-note.png`(안내문 화면), `public/game/case/chrome.png`(크롬 바로가기 아이콘)
- 원본 시트와 생성 브리프: `docs/design/assets-src/`

## 디자인 기록
`docs/design/ui-discussion.md` — Claude × Codex 토론 (방향 탐색 → 8개 시안 → D 확정 → 구현 검증)
