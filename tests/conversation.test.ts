import { it, expect, vi } from 'vitest';
import { analyze } from '../src/core/harness';
import {
  conversationHistory,
  analysisMarkdown,
} from '../src/core/conversation';
import { planSchema } from '../src/core/contracts';
import type { Analysis, ModelProvider } from '../src/core/contracts';
const usage = { inputTokens: 1, outputTokens: 1 };
const table = { columns: ['n'], rows: [{ n: 2 }], truncated: false };
const q = 'SELECT count(*) AS n FROM demo.orders';
const fixture: Analysis = {
  kind: 'answer',
  message: '2件',
  sql: q,
  table,
  chart: { type: 'metric', y: 'n' },
  attempts: 1,
  usage,
  elapsedMs: 10,
  costJpy: null,
  mode: 'live',
  evidence: [{ label: '注文件数', sql: q, table }],
};
function model(): ModelProvider {
  return {
    plan: vi.fn(async () => ({
      value: {
        kind: 'query' as const,
        sql: q,
        message: '',
        queries: [
          { label: '注文', sql: q },
          { label: '顧客', sql: 'SELECT count(*) AS n FROM demo.customers' },
        ],
      },
      usage,
    })),
    summarize: vi.fn(async () => ({
      value: '結果',
      usage,
      report: {
        summary: '結果',
        findings: [{ text: '2件', evidenceIds: [1, 2] }],
        limitations: ['因果は不明'],
        nextQuestions: ['同じ期間の地域別売上は？'],
      },
    })),
  };
}
it('keeps clarification turns and bounded evidence in chronological history', () => {
  const cards = [
    {
      question: '人気とは？',
      result: { ...fixture, kind: 'clarify' as const, evidence: [], sql: '' },
    },
    { question: '販売数量で', result: fixture },
  ];
  const history = conversationHistory(cards);
  expect(history.map((h) => h.kind)).toEqual(['clarify', 'answer']);
  expect(history[1].evidence![0].rows).toEqual([{ n: 2 }]);
  expect(
    conversationHistory(
      Array.from({ length: 20 }, (_, i) => ({
        question: String(i),
        result: fixture,
      })),
    ),
  ).toHaveLength(6);
});
it('executes separate validated queries and sends all evidence to the summary', async () => {
  const m = model(),
    db = { execute: vi.fn(async () => table) };
  const result = await analyze(
    { question: '売上変化を調べて', history: [] },
    { model: m, db },
  );
  expect(result.kind).toBe('answer');
  expect(result.evidence).toHaveLength(2);
  expect(result.attempts).toBe(2);
  expect(m.summarize).toHaveBeenCalledWith(
    '売上変化を調べて',
    expect.any(String),
    table,
    undefined,
    result.evidence,
  );
  expect(result.report?.findings[0].evidenceIds).toEqual([1, 2]);
});
it('preflights the entire plan before any query and bounds query count', async () => {
  const m = model();
  vi.mocked(m.plan).mockResolvedValue({
    value: {
      kind: 'query',
      sql: q,
      message: '',
      queries: [
        { label: 'safe', sql: q },
        { label: 'unsafe', sql: 'DELETE FROM demo.orders' },
      ],
    },
    usage,
  });
  const db = { execute: vi.fn(async () => table) };
  expect(
    (await analyze({ question: 'x', history: [] }, { model: m, db })).kind,
  ).toBe('refuse');
  expect(db.execute).not.toHaveBeenCalled();
  expect(() =>
    planSchema.parse({
      kind: 'query',
      sql: q,
      message: '',
      queries: Array.from({ length: 5 }, () => ({ label: 'x', sql: q })),
    }),
  ).toThrow();
});
it('keeps completed evidence without inventing a full conclusion after a failure', async () => {
  const m = model(),
    db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(table)
        .mockRejectedValueOnce(
          Object.assign(new Error('SECRET'), { code: '57014' }),
        ),
    };
  const r = await analyze({ question: '調査', history: [] }, { model: m, db });
  expect(r.kind).toBe('error');
  expect(r.evidence).toHaveLength(1);
  expect(r.message).not.toContain('SECRET');
  expect(m.summarize).not.toHaveBeenCalled();
});
it('shares a global three-repair budget across all queries', async () => {
  const m = model();
  vi.mocked(m.plan)
    .mockResolvedValueOnce(await m.plan({ question: '', history: [] }))
    .mockResolvedValue({
      value: { kind: 'query', sql: q, message: '' },
      usage,
    });
  const db = {
    execute: vi
      .fn()
      .mockRejectedValue(Object.assign(new Error(), { code: '42703' })),
  };
  const r = await analyze(
    { question: '調査', history: [] },
    { model: m, db, maxRepairs: 99 },
  );
  expect(r.kind).toBe('error');
  expect(db.execute).toHaveBeenCalledTimes(4);
});
it('explains existing evidence without executing SQL, but requires prior evidence', async () => {
  const m = model();
  vi.mocked(m.plan).mockResolvedValue({
    value: { kind: 'explain', sql: '', message: '' },
    usage,
  });
  vi.mocked(m.summarize).mockResolvedValue({ value: '因果は不明', usage });
  const db = { execute: vi.fn(async () => table) };
  const r = await analyze(
    {
      question: '原因と断定できる？',
      history: conversationHistory([{ question: '売上', result: fixture }]),
    },
    { model: m, db },
  );
  expect(r.kind).toBe('answer');
  expect(r.attempts).toBe(0);
  expect(db.execute).not.toHaveBeenCalled();
  expect(
    (await analyze({ question: '原因は？', history: [] }, { model: m, db }))
      .kind,
  ).toBe('clarify');
});
it('rejects nonexistent evidence references and keeps the numerical result', async () => {
  const m = model();
  vi.mocked(m.summarize).mockResolvedValue({
    value: 'fake',
    usage,
    report: {
      summary: 'fake',
      findings: [{ text: 'fake', evidenceIds: [4] }],
      limitations: [],
      nextQuestions: [],
    },
  });
  const r = await analyze(
    { question: 'x', history: [] },
    { model: m, db: { execute: async () => table } },
  );
  expect(r.kind).toBe('answer');
  expect(r.report).toBeUndefined();
  expect(r.message).toContain('解説は取得できませんでした');
});
it('exports reproducible notes with actual evidence and demo labels', () => {
  const text = analysisMarkdown('件数', fixture);
  expect(text).toContain('SELECT');
  expect(text).toContain('根拠 1');
  expect(analysisMarkdown('x', { ...fixture, mode: 'demo' })).toContain(
    'AI・DB未実行',
  );
});
