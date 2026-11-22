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
키가 없으면 오른쪽 위에 "테스트 모드"가 뜨고 고정 응답(Fixture)이 온다. 배포·운영 D1·AI 키 정책은 [`docs/CLOUDFLARE_DEPLOYMENT.md`](docs/CLOUDFLARE_DEPLOYMENT.md).

## 조작
| 조작 | 하는 일 |
|---|---|
| 사건 소개 → 수사 시작 | 짧은 유령 연출(건너뛰기 가능). 시간 제한 없음 |
| 장면의 물건 누르기 | 조사(질문 소모 없음). 표시는 없다. 서버 단서 카드 5장을 장면에서 찾는다 |
| 사람 누르기 | 그 사람이 가운데 서고 질문 입력(최대 500자). 증거 내밀기: 단서 카드 또는 **다른 사람의 말** |
| **수첩** (N) | 단서 노트 / 대상별 기록 / 사건 순서 / 최종 추리(범인 + 동기 자유 서술, 1회 제출) |
| 보고서 | 해결/미해결, 진상, 그날의 역할. "새 게임"이면 범인이 바뀐다 |

## 데이터 흐름
- `lib/api/useGame.ts` — 게임 API(`docs/game/HANDOFF.md` §3)를 화면 데이터(`lib/view/types.ts`)로 바꾼다. 실패한 요청은 같은 `requestId`로 재시도한다.
- `lib/scene/classroom.ts` — 장면 좌표, 어디를 누르면 어느 단서 카드가 나오는지(화면 담당). 역할 기준 정보는 없다.
- 장면에서 찾은 단서, 밑줄, 연필 선, 내가 낸 답은 브라우저 `localStorage`에만 둔다(서버 판정과 무관).
- 연결 안내와 팀 결정 사항: `docs/game/INTEGRATION.md` (Node 서버 시절 기록)
- 서버 쪽: `app/api/{session,question,submit,reset}/route.js` → `lib/server/`(D1·HTTP 공통) · `lib/game/`(배정·상태 기계·시나리오 `data/`) · `lib/ai/`(Fixture/OpenAI/Gemini, 질문 파이프라인)

## 파일
| 영역 | 파일 |
|---|---|
| 타이틀, 게임, 보고서 | `app/page.tsx`, `app/play/page.tsx`, `components/Report.tsx` |
| 진행 화면 조립 | `components/game/GameScreen.tsx` |
| 장면(보이지 않는 클릭 영역), 클로즈업, 사건 소개 | `Stage.tsx`, `Closeup.tsx`, `IntroScreen.tsx` |
| 위쪽 표시, 대사창 | `Hud.tsx`, `DialogBox.tsx`, `PinnableText.tsx` |
| 증거 고르기, 수첩(증거·대상별 기록 포함) | `EvidenceBag.tsx`, `Notebook.tsx` |
| 픽셀 UI 부품 | `components/pixel/*` (픽셀 아이콘, 초상, 배경) |
| 스타일 | `app/globals.css` |
| 글꼴 | `app/fonts/` 갈무리(Galmuri), SIL OFL 1.1 |

## 그림 바꾸기
지금 그림은 Codex로 만든 **임시 그림**입니다. 같은 이름의 파일로 바꾸면 그대로 적용됩니다.
- 배경: `public/game/scenes/classroom.png` (1536×864). 바꾸면 `lib/scene/classroom.ts`의 `hotspots`, `people` 좌표(% 단위)도 맞춘다.
- 지금 그림엔 빈 피해자 자리가 없어 오른쪽 뒤 책상(원래 강사님 책상)을 피해자 자리로 쓴다. 다시 그릴 때 빈 자리를 넣는 것을 권장.
- 초상·상반신: `public/game/{portraits,sprites}/{kim,hwangyc,won,hwanggh}-{neutral,flustered,angry,smile}.png` (서버의 사람 ID 기준)
- 단서 아이콘: `public/game/items/gk-*.png`
- 원본 시트와 생성 브리프: `docs/design/assets-src/`

## 디자인 기록
`docs/design/ui-discussion.md` — Claude × Codex 토론 (방향 탐색 → 8개 시안 → D 확정 → 구현 검증)
