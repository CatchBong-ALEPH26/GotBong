// 실제 AI 호출 예산 (스크립트 전용, Node 파일 접근을 쓰므로 Worker 코드에서 가져오지 않는다).
// - 모든 실제 호출을 장부(docs/game/eval/ai-calls.jsonl)에 한 줄씩 남긴다: 시각, 묶음 이름, 작업, 모델, 지연, 입력·출력·캐시 토큰.
// - 장부의 누적 호출 수가 상한(AI_CALL_BUDGET, 기본 60)에 닿으면 호출하기 전에 멈춘다 (재시도·반복 폭주 방지).
// - 장부는 커밋해 둔다. 같은 검증을 다시 돌리지 말고 장부와 결과 문서를 재사용한다.
// 자동 테스트(npm test)는 이 모듈도 실제 모델도 쓰지 않는다 (Fixture 만).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LEDGER = 'docs/game/eval/ai-calls.jsonl';

export class BudgetError extends Error {}

/** 장부의 누적 호출 수 (요약 줄은 count 만큼 센다) */
export function usedCalls(ledger = LEDGER) {
  if (!existsSync(ledger)) return 0;
  return readFileSync(ledger, 'utf8').split('\n').filter(Boolean)
    .reduce((n, line) => n + (JSON.parse(line).count ?? 1), 0);
}

/**
 * 실제 모델을 예산 장부로 감싼다.
 * @param {(task, req) => Promise<{value, metric}>} model
 * @param {{ max?: number, label: string, ledger?: string }} opts max: 장부 전체 상한
 */
export function budgeted(model, { max = Number(process.env.AI_CALL_BUDGET) || 60, label, ledger = LEDGER }) {
  mkdirSync(dirname(ledger), { recursive: true });
  return async (task, req) => {
    const used = usedCalls(ledger);
    if (used >= max) throw new BudgetError(`실제 호출 예산 ${max}회를 다 썼습니다 (장부 ${used}회). 멈춥니다.`);
    let result, error;
    try {
      result = await model(task, req);
    } catch (e) {
      error = e;
    }
    const m = result?.metric ?? {};
    appendFileSync(ledger, JSON.stringify({
      at: new Date().toISOString(), label, task, model: m.model ?? null, ms: m.ms ?? null,
      inputTokens: m.inputTokens ?? null, outputTokens: m.outputTokens ?? null, cachedTokens: m.cachedTokens ?? null,
      ...(req.cacheKey ? { cacheKey: req.cacheKey } : {}),
      ...(error ? { error: error.message } : {})
    }) + '\n');
    if (error) throw error;
    return result;
  };
}
