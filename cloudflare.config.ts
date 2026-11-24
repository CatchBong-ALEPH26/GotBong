import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

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
      DB: bindings.d1({
        name: "gotbong-dev",
        id: "215068c4-cd09-4933-9f86-460b937a13b5",
      }),
      // 새 게임 생성 속도 제한: IP당 1분에 10번 (/api/session 첫 접속, /api/reset)
      GAME_CREATE_LIMITER: bindings.rateLimit({
        namespace: "1001",
        simple: { limit: 10, period: 60 },
      }),
    },
    // 매일 04:00 UTC(한국 13:00), 7일 지난 빈 게임 정리
    triggers: [triggers.scheduled({ schedule: "0 4 * * *" })],
  }),
});
