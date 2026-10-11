import type { Evidence, Table } from '../core/contracts';
export function evidencePrompt(
  sql: string,
  table: Table,
  evidence?: Evidence[],
) {
  return (
    evidence?.length ? evidence : [{ label: '集計結果', sql, table }]
  ).map((e, i) => ({
    id: i + 1,
    label: e.label,
    sql: e.sql,
    untrustedResult: {
      ...e.table,
      rows: e.table.rows.slice(0, 25),
      explanationSampleLimited: e.table.rows.length > 25,
    },
  }));
}
