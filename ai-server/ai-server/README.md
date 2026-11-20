# ai-server — 유령 키보드 AI 용의자 서버

용의자 4명(김봉경·황윤찬·원·황건희)이 각자의 캐릭터 시트 말투로 심문에 답하는 서버입니다. 역할(범인 포함)과 피해자는 게임마다 무작위로 바뀝니다. Node.js 24 이상, npm 의존성 없음.

| 문서 | 내용 |
|---|---|
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | **GotBong 화면에 붙이는 법**, 팀 결정이 필요한 차이점 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | API 명세, AI 기능, 화면 구현 규칙, 실제 평가 결과 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 내부 설계 (Mermaid 다이어그램) |

## 실행

```powershell
cd ai-server
Copy-Item .env.example .env   # OPENAI_API_KEY 입력. GotBong과 같이 쓸 때는 PORT=3001
npm.cmd start                 # 단독 실행 시 참고 화면: http://127.0.0.1:3000
npm.cmd test                  # 자동 테스트 11개
npm.cmd run eval -- --quick   # 실제 모델 평가 (요청 약 80회, 유료)
```

`.env`는 커밋하지 않습니다 (`.gitignore` 처리됨). 키는 팀 내부에서 따로 전달합니다.

## 구성

| 경로 | 내용 |
|---|---|
| `server.mjs` | 진입점 |
| `src/` | http, game(배정·상태 기계), pipeline(분류·초안·검증), prompts, llm(OpenAI·Gemini), db(SQLite), josa |
| `data/` | 시나리오(`case.mjs`), 캐릭터 시트(`characters.mjs`), 피해자 후보(`victims.mjs`) |
| `public/` | 동작 확인용 참고 화면 |
| `test/`, `scripts/eval.mjs` | 자동 테스트, 실제 모델 평가 |
