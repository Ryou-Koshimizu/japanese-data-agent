import { it, expect } from 'vitest';
import { sameResult } from '../src/eval/compare';
import { selectChart } from '../src/core/chart';
it('compares result values, not SQL aliases', () => {
  expect(
    sameResult(
      { columns: ['a'], rows: [{ a: 1 }, { a: 2 }], truncated: false },
      { columns: ['b'], rows: [{ b: 2 }, { b: 1 }], truncated: false },
    ),
  ).toBe(true);
});
it('preserves ordering and duplicates', () => {
  const a = { columns: ['a'], rows: [{ a: 1 }, { a: 2 }], truncated: false };
  expect(sameResult(a, { ...a, rows: [{ a: 2 }, { a: 1 }] }, true)).toBe(false);
  expect(sameResult(a, { ...a, rows: [{ a: 1 }, { a: 1 }] })).toBe(false);
});
it('rejects truncation and compares numeric tolerance', () => {
  const a = { columns: ['a'], rows: [{ a: 1 }], truncated: false };
  expect(sameResult(a, { ...a, truncated: true })).toBe(false);
  expect(sameResult(a, { ...a, rows: [{ a: 1.00000001 }] })).toBe(true);
});
it('chooses a time series, category, metric or table', () => {
  expect(
    selectChart({
      columns: ['month', 'sales'],
      rows: [{ month: '2026-09', sales: 1 }],
      truncated: false,
    }).type,
  ).toBe('line');
  expect(
    selectChart({
      columns: ['region', 'sales'],
      rows: [{ region: '東京', sales: 1 }],
      truncated: false,
    }).type,
  ).toBe('bar');
  expect(
    selectChart({ columns: ['sales'], rows: [{ sales: 1 }], truncated: false })
      .type,
  ).toBe('metric');
  expect(selectChart({ columns: [], rows: [], truncated: false }).type).toBe(
    'table',
  );
});
