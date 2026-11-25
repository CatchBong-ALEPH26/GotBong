// 프롬프트 캐시 적중 확인 (실제 모델, 유료 호출, 기본 최대 7회).
// 같은 게임·같은 NPC에게 질문 두 번: 판정 → 초안 → 검증 → 판정 → 초안 → 검증.
// 확인할 것: 검증이 판정의 앞부분 캐시를 다시 쓰는지, 두 번째 판정·초안이 첫 번째 캐시를 다시 쓰는지.
//   node --env-file=.env scripts/cache-probe.mjs [--max-calls=7]
// 결과: docs/game/eval/cache-probe-<시각>.md, 호출마다 docs/game/eval/ai-calls.jsonl 에도 남는다.

import { mkdirSync, writeFileSync } from 'node:fs';
import { modelFromEnv } from '../lib/ai/llm.mjs';
import { budgeted } from '../lib/ai/budget.mjs';
import { runQuestion } from '../lib/ai/pipeline.mjs';
import { initialState } from '../lib/game/game.mjs';

const { mode, model: rawModel, mainModel, fastModel } = modelFromEnv(process.env, { maxWaitMs: 20000, maxRetries: 1 });
if (mode === 'fixture') {
  console.error('OPENAI_API_KEY 가 필요합니다 (.env).');
  process.exit(1);
}
const MAX = Number(process.argv.find(a => a.startsWith('--max-calls='))?.split('=')[1] ?? 7);
let calls = 0;
const ledgered = budgeted(rawModel, { label: 'cache-probe' });
const model = async (task, req) => {
  if (++calls > MAX) throw new Error(`이 스크립트의 호출 상한 ${MAX}회`);
  return ledgered(task, req);
};

const game = { id: 'cache-probe-' + Date.now(), cast: { A: 'kim', B: 'hwangyc', C: 'won', D: 'hwanggh' }, victim: '곽도현', state: initialState() };
const roleId = 'A';
const history = [];
const rows = [];
for (const question of ['쉬는 시간에 어디 계셨어요?', '복도에 계셨다면, 쉬는 시간 중간쯤 교실 안에 잠깐 들어온 적은 없어요?']) {
  const r = await runQuestion({ model, game, roleId, question, attach: null, history, remaining: 20 });
  for (const m of r.debug.calls) rows.push({ question, ...m });
  if (r.status === 'answered' && r.pass) {
    history.push({ question, reply: r.reply, attach: null });
    game.state = { ...game.state, [roleId]: r.state };
  }
  console.log(question, '→', r.status, r.pass ?? '', (r.reply ?? '').slice(0, 60));
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
const md = [
  `# 프롬프트 캐시 확인 ${new Date().toISOString()}`,
  '',
  `- 제공자 ${mode} / 메인 ${mainModel} / 빠른 모델 ${fastModel} / 실제 호출 ${rows.length}회`,
  `- 전체 입력 ${rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0)} 토큰 중 캐시 ${rows.reduce((s, r) => s + (r.cachedTokens ?? 0), 0)} 토큰 (${pct(rows.reduce((s, r) => s + (r.cachedTokens ?? 0), 0), rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0))})`,
  '',
  '| # | 질문 | 작업 | 모델 | 지연(ms) | 입력 | 캐시 | 캐시 비율 | 출력 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r, i) => `| ${i + 1} | ${r.question.slice(0, 12)}… | ${r.task} | ${r.model} | ${r.ms} | ${r.inputTokens} | ${r.cachedTokens} | ${pct(r.cachedTokens ?? 0, r.inputTokens ?? 0)} | ${r.outputTokens} |`)
].join('\n');
mkdirSync('docs/game/eval', { recursive: true });
const file = `docs/game/eval/cache-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
writeFileSync(file, md + '\n');
console.log(md);
console.log('결과:', file);
