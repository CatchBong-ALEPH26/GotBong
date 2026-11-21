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
        id: "0737af8d-700c-46ec-a791-2221fc583a8e",
      }),
    },
  }),
});
