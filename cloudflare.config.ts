import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

// 로컬 Worker에서 실제 AI 키를 쓸 때만(npm run dev:ai) 비밀 값을 선언한다. 로컬 개발은 선언된 비밀 값만
// .dev.vars 에서 채운다. 평소 개발·빌드·배포에서는 선언하지 않으므로 운영(테스트 모드)에 영향이 없다.
// 운영에 키를 등록할 때는 팀 합의 후 Cloudflare Secrets 로 등록하고 이 선언을 항상 켜는 것을 검토한다.
const localAiSecrets =
  process.env.GOTBONG_LOCAL_AI === "1"
    ? { OPENAI_API_KEY: bindings.secret(), GEMINI_API_KEY: bindings.secret() }
    : {};

export default defineConfig({
  worker: defineWorker({
    name: "gotbong",
    // vinext 처리(fetch)에 빈 게임 정리(scheduled)를 더한 진입점
    entrypoint: "./worker/index.js",
    compatibilityDate: "2026-11-20",
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      ...localAiSecrets,
      DB: bindings.d1({
        name: "gotbong-dev",
        id: "215068c4-cd09-4933-9f86-460b937a13b5",
      }),
      // 새 게임 생성 속도 제한 바인딩. 2026-11-25부터 코드에서 호출하지 않는다 (학원 IP 허용 목록 + 진행 중 방 수 제한으로 대체).
      // 외부 공개 때 느슨한 제한으로 다시 쓸 수 있게 선언만 남겨 둔다 (제거는 배포 담당과 합의).
      GAME_CREATE_LIMITER: bindings.rateLimit({
        namespace: "1001",
        simple: { limit: 10, period: 60 },
      }),
    },
    // 매일 04:00 UTC(한국 13:00), 7일 지난 빈 게임 정리
    triggers: [triggers.scheduled({ schedule: "0 4 * * *" })],
  }),
});
