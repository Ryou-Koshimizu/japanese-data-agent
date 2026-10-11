import type { Table } from '../core/contracts';
export function sameResult(a: Table, b: Table, ordered = false): boolean {
  if (
    a.truncated ||
    b.truncated ||
    a.columns.length !== b.columns.length ||
    a.rows.length !== b.rows.length
  )
    return false;
  const values = (t: Table) => t.rows.map((r) => t.columns.map((c) => r[c]));
  const equal = (x: unknown, y: unknown) =>
    typeof x === 'number' && typeof y === 'number'
      ? Math.abs(x - y) <=
        Math.max(1e-6, Math.max(Math.abs(x), Math.abs(y)) * 1e-9)
      : x === y;
  const rowsEqual = (x: unknown[], y: unknown[]) =>
    x.every((v, i) => equal(v, y[i]));
  const x = values(a),
    y = values(b);
  if (ordered) return x.every((row, i) => rowsEqual(row, y[i]));
  // A multiset comparison preserves duplicates and applies numeric tolerance without lexical rounding.
  const used = new Set<number>();
  return x.every((row) => {
    const index = y.findIndex(
      (other, i) => !used.has(i) && rowsEqual(row, other),
    );
    if (index < 0) return false;
    used.add(index);
    return true;
  });
}
