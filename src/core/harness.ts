import { performance } from 'node:perf_hooks';
import {
  requestSchema,
  planSchema,
  summarySchema,
  emptyTable,
  type Analysis,
  type Evidence,
  type Report,
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
  const input = requestSchema.parse(raw),
    start = performance.now();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let sql = '',
    attempts = 0,
    repairs = 0;
  let errorCode: string | undefined, report: Report | undefined;
  const evidence: Evidence[] = [],
    emit = deps.onEvent ?? (() => {});
  const maxRepairs = Math.min(3, Math.max(0, deps.maxRepairs ?? 3));
  const finish = (
    kind: Analysis['kind'],
    message: string,
    table = evidence[0]?.table ?? emptyTable,
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
      evidence,
      ...(report ? { report } : {}),
      ...(errorCode ? { errorCode } : {}),
    };
    emit({ type: 'result', result });
    return result;
  };
  const getPlan = async (
    repair?: { sql: string; code: string },
    repairInput = input,
  ) => {
    deps.signal?.throwIfAborted();
    const output = await deps.model.plan(repairInput, repair, deps.signal);
    usage.inputTokens += output.usage.inputTokens;
    usage.outputTokens += output.usage.outputTokens;
    return planSchema.parse(output.value);
  };
  const modelFailure = (error: unknown) => {
    errorCode =
      error instanceof Error && /^CODEX_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'MODEL_RESPONSE_INVALID';
    return finish(
      'error',
      errorCode === 'CODEX_RATE_LIMIT'
        ? 'ChatGPTの利用枠またはレート上限に達しました。利用状況を確認してから再実行してください。'
        : 'AIの応答を取得・検証できませんでした。認証・モデル・利用枠を確認してください。',
    );
  };
  deps.signal?.throwIfAborted();
  emit({ type: 'step', stage: '会話とスキーマ確認' });
  emit({ type: 'step', stage: '分析計画・SQL生成', attempt: 1 });
  let plan;
  try {
    plan = await getPlan();
  } catch (error) {
    return modelFailure(error);
  }
  if (plan.kind === 'clarify' || plan.kind === 'refuse')
    return finish(plan.kind, plan.message);
  if (plan.kind === 'explain') {
    const previous = [...input.history]
      .reverse()
      .find((h) => h.kind === 'answer' && h.evidence?.length);
    if (!previous?.evidence?.length)
      return finish(
        'clarify',
        'まだ説明の根拠となる集計がありません。対象の期間・指標を教えてください。',
      );
    for (const e of previous.evidence)
      evidence.push({
        label: `${e.label}（履歴の標本）`,
        sql: e.sql,
        table: { columns: e.columns, rows: e.rows, truncated: e.truncated },
      });
    sql = evidence[0].sql;
    emit({ type: 'step', stage: '既存の根拠を説明（新規SQLなし）' });
  } else {
    const queries = plan.queries.length
      ? plan.queries
      : [{ label: plan.message || '集計結果', sql: plan.sql }];
    // Preflight the whole plan; a later dangerous query prevents ALL execution.
    try {
      for (const query of queries) query.sql = await validateSql(query.sql);
    } catch (error) {
      return finish(
        'refuse',
        error instanceof UnsafeSqlError
          ? error.message
          : 'SQL検証に失敗しました。',
      );
    }
    for (const [queryIndex, query] of queries.entries()) {
      sql = query.sql;
      emit({
        type: 'step',
        stage: `調査 ${queryIndex + 1}/${queries.length}: ${query.label}`,
      });
      while (true) {
        deps.signal?.throwIfAborted();
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
        emit({ type: 'step', stage: '実行', attempt: attempts + 1 });
        attempts++;
        try {
          const table = await deps.db.execute(sql, deps.signal);
          evidence.push({ label: query.label, sql, table });
          break;
        } catch (error) {
          const code = String(
            (error as { code?: string }).code ?? 'EXECUTION_FAILED',
          );
          if (
            repairs >= maxRepairs ||
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
              `調査を完了できませんでした（${/^[A-Z0-9_]{1,30}$/.test(code) ? code : 'EXECUTION_FAILED'}）。${evidence.length ? '完了済みの根拠だけを表示します。全体の結論は未生成です。' : 'SQLを確認し、質問を言い換えてください。'}`,
            );
          repairs++;
          emit({
            type: 'step',
            stage: 'エラーを検知して修正中',
            attempt: attempts + 1,
          });
          try {
            const repaired = await getPlan(
              { sql, code },
              {
                ...input,
                question:
                  `${input.question}\n修正対象は「${query.label}」のSQL単文のみ。調査計画は変更しないでください。`.slice(
                    0,
                    1500,
                  ),
              },
            );
            if (repaired.kind !== 'query')
              return finish(
                repaired.kind === 'explain' ? 'error' : repaired.kind,
                repaired.message || '修正を完了できませんでした。',
              );
            if (repaired.queries.length > 1)
              return finish('error', '修正時の調査計画変更を拒否しました。');
            sql = repaired.queries[0]?.sql ?? repaired.sql;
          } catch (error) {
            return modelFailure(error);
          }
        }
      }
    }
    sql = evidence[0].sql;
  }
  emit({ type: 'step', stage: '根拠・限界・次の調査を整理' });
  try {
    const output = await deps.model.summarize(
      input.question,
      sql,
      evidence[0].table,
      deps.signal,
      evidence,
    );
    usage.inputTokens += output.usage.inputTokens;
    usage.outputTokens += output.usage.outputTokens;
    if (output.report) {
      report = summarySchema.parse(output.report);
      if (
        report.findings.some((f) =>
          f.evidenceIds.some((id) => id > evidence.length),
        )
      )
        throw new Error('INVALID_EVIDENCE_REFERENCE');
    }
    return finish('answer', report?.summary ?? output.value);
  } catch {
    report = undefined;
    return finish(
      'answer',
      '集計は完了しました。AI解説は取得できませんでした。表とSQLを確認してください。',
    );
  }
}
