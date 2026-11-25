// 로컬 Worker를 실제 AI 키로 띄운다 (유료 호출). 키는 .dev.vars 에만 둔다 (커밋 금지).
//   .dev.vars 예:  OPENAI_API_KEY=sk-...
// cloudflare.config.ts 가 GOTBONG_LOCAL_AI=1 일 때만 비밀 값을 선언하고, 로컬 개발이 그 값을 .dev.vars 에서 채운다.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('.dev.vars')) {
  console.error('.dev.vars 가 없습니다. OPENAI_API_KEY=... 한 줄을 넣어 만드세요 (커밋하지 않음).');
  process.exit(1);
}
const child = spawn('npx vite dev --port 3000', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GOTBONG_LOCAL_AI: '1' }
});
child.on('exit', code => process.exit(code ?? 0));
