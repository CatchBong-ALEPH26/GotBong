import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "gotbong",
    entrypoint: "vinext/server/fetch-handler",
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
    },
  }),
});
