import { performance } from 'node:perf_hooks';
import {
  requestSchema,
  planSchema,
  emptyTable,
  type Analysis,
  type Event,
  type ModelProvider,
  type QueryExecutor,
  type RequestInput,
} from './contracts';
import { validateSql, UnsafeSqlError } from './validator';
import { selectChart } from './chart';
export type Harness = {
  model: ModelProvider;
  db: QueryExecutor;
  maxRepairs?: number;
  onEvent?: (event: Event) => void;
  signal?: AbortSignal;
  prices?: { input: number; output: number; jpyPerUsd: number };
};
export async function analyze(
  raw: RequestInput,
  deps: Harness,
): Promise<Analysis> {
  const input = requestSchema.parse(raw);
  const start = performance.now();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let sql = '';
  let attempts = 0;
  const emit = deps.onEvent ?? (() => {});
  const maxRepairs = Math.min(3, Math.max(0, deps.maxRepairs ?? 3));
  const finish = (
    kind: Analysis['kind'],
    message: string,
    table = emptyTable,
  ): Analysis => {
    const costJpy = deps.prices
      ? ((usage.inputTokens * deps.prices.input +
          usage.outputTokens * deps.prices.output) /
          1e6) *
        deps.prices.jpyPerUsd
      : null;
    const result: Analysis = {
      kind,
      message,
      sql,
      table,
      chart: selectChart(table),
      attempts,
      usage,
      elapsedMs: Math.round(performance.now() - start),
      costJpy,
      mode: 'live',
    };
    emit({ type: 'result', result });
    return result;
  };
  let repair: { sql: string; code: string } | undefined;
  emit({ type: 'step', stage: 'スキーマ確認' });
  for (let index = 0; index <= maxRepairs; index++) {
    deps.signal?.throwIfAborted();
    emit({
      type: 'step',
      stage: index ? 'エラーを検知して修正中' : 'SQL生成',
      attempt: index + 1,
    });
    let plan;
    try {
      const output = await deps.model.plan(input, repair, deps.signal);
      usage.inputTokens += output.usage.inputTokens;
      usage.outputTokens += output.usage.outputTokens;
      plan = planSchema.parse(output.value);
    } catch {
      return finish(
        'error',
        'AIの応答を取得・検証できませんでした。キー・モデル・利用枠を確認してください。',
      );
    }
    if (plan.kind !== 'query') return finish(plan.kind, plan.message);
    sql = plan.sql;
    emit({ type: 'sql', sql });
    emit({ type: 'step', stage: 'SQL検証' });
    try {
      sql = await validateSql(sql);
    } catch (error) {
      return finish(
        'refuse',
        error instanceof UnsafeSqlError
          ? error.message
          : 'SQL検証に失敗しました。',
      );
    }
    emit({ type: 'step', stage: '実行', attempt: index + 1 });
    attempts++;
    let table;
    try {
      table = await deps.db.execute(sql, deps.signal);
    } catch (error) {
      // Only SQLSTATE is returned to the model; connection strings and DB error text are never forwarded.
      const code = String(
        (error as { code?: string }).code ?? 'EXECUTION_FAILED',
      );
      if (
        index === maxRepairs ||
        ![
          '42703',
          '42P01',
          '42883',
          '42601',
          '42803',
          '42804',
          '22P02',
          '22012',
        ].includes(code)
      )
        return finish(
          'error',
          `実行できませんでした（${/^[A-Z0-9_]{1,30}$/.test(code) ? code : 'EXECUTION_FAILED'}）。SQLを確認し、質問を言い換えてください。`,
        );
      repair = { sql, code };
      continue;
    }
    emit({ type: 'step', stage: '解説生成' });
    try {
      const output = await deps.model.summarize(
        input.question,
        sql,
        table,
        deps.signal,
      );
      usage.inputTokens += output.usage.inputTokens;
      usage.outputTokens += output.usage.outputTokens;
      return finish('answer', output.value, table);
    } catch {
      return finish(
        'answer',
        '集計は完了しました。AI解説は取得できませんでした。表とSQLを確認してください。',
        table,
      );
    }
  }
  return finish('error', '分析を完了できませんでした。');
}
