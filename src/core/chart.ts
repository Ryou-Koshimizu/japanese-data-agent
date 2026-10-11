import type { Chart, Table } from './contracts';
export function selectChart(table: Table): Chart {
  if (!table.rows.length) return { type: 'table' };
  const y = table.columns.find((c) =>
    table.rows.every((r) => r[c] === null || typeof r[c] === 'number'),
  );
  if (!y) return { type: 'table' };
  if (table.rows.length === 1 && table.columns.length === 1)
    return { type: 'metric', y };
  const x = table.columns.find(
    (c) => c !== y && table.rows.every((r) => typeof r[c] === 'string'),
  );
  if (!x || table.rows.length > 50) return { type: 'table' };
  const isTime = table.rows.every((r) =>
    /^\d{4}-\d{2}(?:-\d{2})?$/.test(String(r[x])),
  );
  return { type: isTime ? 'line' : 'bar', x, y };
}
