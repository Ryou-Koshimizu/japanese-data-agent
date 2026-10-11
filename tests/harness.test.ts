import { it, expect, vi } from 'vitest';
import { analyze } from '../src/core/harness';
import type { ModelProvider } from '../src/core/contracts';
const usage = { inputTokens: 10, outputTokens: 5 };
function provider(sql = 'SELECT count(*) FROM demo.orders'): ModelProvider {
  return {
    plan: vi.fn(async () => ({
      value: { kind: 'query' as const, sql, message: '' },
      usage,
    })),
    summarize: vi.fn(async () => ({ value: '注文件数は2件です。', usage })),
  };
}
const table = { columns: ['n'], rows: [{ n: 2 }], truncated: false };
it('executes safe SQL and emits progress and measured usage', async () => {
  const events: unknown[] = [];
  const db = { execute: vi.fn(async () => table) };
  const r = await analyze(
    { question: '注文件数は？', history: [] },
    {
      model: provider(),
      db,
      onEvent: (e) => events.push(e),
      prices: { input: 1, output: 2, jpyPerUsd: 150 },
    },
  );
  expect(r.kind).toBe('answer');
  expect(r.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  expect(r.costJpy).toBeCloseTo(0.006);
  expect(events.length).toBeGreaterThan(4);
  expect(db.execute).toHaveBeenCalledOnce();
});
it('never executes rejected SQL', async () => {
  const db = { execute: vi.fn(async () => table) };
  const r = await analyze(
    { question: '削除', history: [] },
    { model: provider('DELETE FROM demo.orders'), db },
  );
  expect(r.kind).toBe('refuse');
  expect(db.execute).not.toHaveBeenCalled();
});
it('repairs SQLSTATE errors and validates the repaired query again', async () => {
  const model = provider();
  const plan = vi.spyOn(model, 'plan');
  plan.mockResolvedValueOnce({
    value: {
      kind: 'query',
      sql: 'SELECT missing FROM demo.orders',
      message: '',
    },
    usage,
  });
  const db = {
    execute: vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('secret connection'), { code: '42703' }),
      )
      .mockResolvedValue(table),
  };
  const r = await analyze({ question: '件数', history: [] }, { model, db });
  expect(r.attempts).toBe(2);
  expect(plan.mock.calls[1][1]?.code).toBe('42703');
  expect(plan.mock.calls[1][1]?.sql.replace(/\s+/g, ' ')).toBe(
    'SELECT missing FROM demo.orders',
  );
});
it('rejects a dangerous repair before execution', async () => {
  const model = provider();
  vi.spyOn(model, 'plan')
    .mockResolvedValueOnce({
      value: {
        kind: 'query',
        sql: 'SELECT missing FROM demo.orders',
        message: '',
      },
      usage,
    })
    .mockResolvedValueOnce({
      value: { kind: 'query', sql: 'DROP TABLE demo.orders', message: '' },
      usage,
    });
  const db = {
    execute: vi
      .fn()
      .mockRejectedValue(Object.assign(new Error(), { code: '42703' })),
  };
  const r = await analyze({ question: '件数', history: [] }, { model, db });
  expect(r.kind).toBe('refuse');
  expect(db.execute).toHaveBeenCalledTimes(1);
});
it('allows initial execution plus at most 3 repairs', async () => {
  const model = provider();
  const db = {
    execute: vi
      .fn()
      .mockRejectedValue(Object.assign(new Error(), { code: '42703' })),
  };
  const r = await analyze(
    { question: '件数', history: [] },
    { model, db, maxRepairs: 99 },
  );
  expect(r.kind).toBe('error');
  expect(db.execute).toHaveBeenCalledTimes(4);
});
it('does not retry privilege and timeout failures', async () => {
  for (const code of ['42501', '57014', 'UNSAFE_ROLE']) {
    const db = {
      execute: vi.fn().mockRejectedValue(Object.assign(new Error(), { code })),
    };
    await analyze({ question: '件数', history: [] }, { model: provider(), db });
    expect(db.execute).toHaveBeenCalledOnce();
  }
});
it('clarification and refusal do not execute SQL', async () => {
  for (const kind of ['clarify', 'refuse'] as const) {
    const model = provider();
    vi.spyOn(model, 'plan').mockResolvedValue({
      value: { kind, sql: '', message: '確認' },
      usage,
    });
    const db = { execute: vi.fn(async () => table) };
    const r = await analyze({ question: '最近', history: [] }, { model, db });
    expect(r.kind).toBe(kind);
    expect(db.execute).not.toHaveBeenCalled();
  }
});
it('keeps a result when summary generation fails', async () => {
  const model = provider();
  vi.spyOn(model, 'summarize').mockRejectedValue(new Error());
  const r = await analyze(
    { question: '件数', history: [] },
    { model, db: { execute: async () => table } },
  );
  expect(r.kind).toBe('answer');
  expect(r.table).toEqual(table);
  expect(r.message).toContain('解説は取得できませんでした');
});
it('never falls back to demo on provider failure', async () => {
  const model = provider();
  vi.spyOn(model, 'plan').mockRejectedValue(new Error());
  const r = await analyze(
    { question: '件数', history: [] },
    { model, db: { execute: async () => table } },
  );
  expect(r.mode).toBe('live');
  expect(r.kind).toBe('error');
});
it('respects cancellation', async () => {
  const c = new AbortController();
  c.abort();
  await expect(
    analyze(
      { question: '件数', history: [] },
      {
        model: provider(),
        db: { execute: async () => table },
        signal: c.signal,
      },
    ),
  ).rejects.toThrow();
});
