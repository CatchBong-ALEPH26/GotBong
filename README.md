# GotBong · 방과후 탐정단 — AI 추리게임 (D 형태 UI 초안)

16비트 픽셀 측면 어드벤처(팀 확정안 **D**) 화면으로 만든 추리게임 초안입니다. 서버와 Gemini 없이 가짜 데이터(`lib/mock/`)로 동작하고, 가짜 용의자가 스펙 4장의 사건 대본대로 답하기 때문에 첫 사건 "사라진 도시락"을 처음부터 보고서까지 풀어 볼 수 있습니다.

## 실행
```bash
npm install
npm run dev   # http://localhost:3000 → 닉네임 → 새 방 만들기 → 수사 시작
```
개발 모드에서는 화면의 **DEV 화면 전환** 바로 대기실 / 진행 / 보고서를 바로 오갈 수 있습니다.

## 조작 (사건: 유령 키보드)
| 조작 | 하는 일 |
|---|---|
| 사건 소개 → 수사 시작 | 20분 타이머 시작, 짧은 유령 연출(건너뛰기 가능) |
| 장면의 물건 누르기 | 조사(질문 소모 없음). 표시는 없다. 모니터·본체는 클로즈업이 열린다 |
| 무선 키보드 누르기 | 단서 3·4를 얻은 뒤 키보드 테스트 (처음 1회 차감) |
| 사람 누르기 | 그 사람이 가운데 서고 질문 입력. 추천 질문, 증거 내밀기(증거만 내밀어도 1회) |
| **수첩** (N) | 단서 노트 / 대상별 기록 / 사건 순서 / 최종 추리(범인 + 동기, 1회 제출) |
| 시간 종료 | 최종 추리 쪽이 열리고 30초 안에 제출. 미제출이면 패배 |

데이터는 `lib/mock/ghostKeyboard.ts`(예시, 시나리오 담당 문서를 옮긴 것)와 `lib/mock/useMockGame.ts`(가짜 서버)에 있다. 변경 계획은 팀 공유 문서 「유령키보드_UI_변경계획」.

## 파일
| 영역 | 파일 |
|---|---|
| 로비, 대기실, 보고서 | `app/page.tsx`, `components/Waiting.tsx`, `components/Report.tsx` |
| 진행 화면 조립 | `components/game/GameScreen.tsx` |
| 장면(보이지 않는 클릭 영역), 클로즈업, 키보드 테스트, 사건 소개 | `Stage.tsx`, `Closeup.tsx`, `KeyboardTest.tsx`, `IntroScreen.tsx` |
| 위쪽 표시, 대사창 | `Hud.tsx`, `DialogBox.tsx`, `PinnableText.tsx` |
| 증거 고르기, 수첩(증거·대상별 기록 포함) | `EvidenceBag.tsx`, `Notebook.tsx` |
| 픽셀 UI 부품 | `components/pixel/*` (픽셀 아이콘, 초상, 배경) |
| 스타일 | `app/globals.css` |
| 글꼴 | `app/fonts/` 갈무리(Galmuri), SIL OFL 1.1 |

## 그림 바꾸기
지금 그림은 Codex로 만든 **임시 그림**입니다. 같은 이름의 파일로 바꾸면 그대로 적용됩니다.
- 배경: `public/game/scene.png` (1536×1024). 바꾸면 `lib/mock/lunchbox.ts`의 `hotspots`, 용의자 `hit` 좌표(% 단위)도 새 그림에 맞춰야 합니다.
- 초상: `public/game/portraits/{a,b,c,d}-{neutral,flustered,angry,smile}.png`
- 증거 아이콘: `public/game/items/{증거 id}.png`
- 원본 시트와 생성 브리프: `docs/design/assets-src/`, `docs/design/drafts/briefs/d-assets.md`

## API 연결 시 바꿀 곳
- `lib/mock/useMockGame.ts` → 실제 API 호출 + 2초 폴링 (`GameActions` 인터페이스 유지)
- 진술 조각(`notes`)과 연필 메모(`contradictions`)는 본인만 보는 데이터라 저장소에 표 2개 추가 필요
- `ask`에 `quoteNoteIds`(인용한 진술, 최대 2개)가 들어감. 서버가 원문을 프롬프트에 붙인다
- 용의자마다 `observeId`(겉모습 살펴보기). 스펙 4.5의 "B의 입가"가 여기로 옮겨짐

## 디자인 기록
`docs/design/ui-discussion.md` — Claude × Codex 토론 (방향 탐색 → 8개 시안 → D 확정 → 구현 검증)
