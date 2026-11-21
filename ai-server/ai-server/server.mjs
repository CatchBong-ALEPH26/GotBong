// 진입점. 환경변수(.env)를 읽어 서버를 띄운다. 변수 목록은 .env.example 참고.

import { pathToFileURL } from 'node:url';
import { createApp } from './src/http.mjs';
import { modelFromEnv } from './src/llm.mjs';
import { parseCast } from './src/game.mjs';

export { createApp };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const { mode, model, mainModel, fastModel } = modelFromEnv(env);
  const fixed = { cast: parseCast(env.CAST), victim: env.VICTIM || undefined };
  const port = Number(env.PORT || 3000);
  const debug = env.DEBUG === '1';
  createApp({ dbPath: '.data/game.sqlite', model, mode, debug, fixed })
    .listen(port, '127.0.0.1', () => console.log(
      `http://127.0.0.1:${port}  [${mode}] main=${mainModel} fast=${fastModel}${debug ? '  DEBUG' : ''}`));
}
