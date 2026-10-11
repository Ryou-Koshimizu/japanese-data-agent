import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { validateSql } from '../src/core/validator';
import { sameResult } from '../src/eval/compare';
import type { Row, Table } from '../src/core/contracts';
const db = new PGlite();
beforeAll(async () => {
  const init = (await readFile('db/init.sql', 'utf8'))
    .split('\n')
    .filter((line) => !line.includes('ON DATABASE analytics'))
    .join('\n');
  await db.exec(init);
  await db.exec(await readFile('db/seed.sql', 'utf8'));
}, 60000);
afterAll(async () => {
  await db.close();
});
it('fixed seed creates the specified fictional dataset', async () => {
  for (const [table, count] of Object.entries({
    customers: 5000,
    products: 300,
    orders: 50000,
    order_items: 120000,
    campaigns: 30,
  })) {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::integer n FROM demo.${table}`,
    );
    expect(r.rows[0].n).toBe(count);
  }
});
it('all 40 gold queries pass validation and execute with a nonempty result', async () => {
  const cases = JSON.parse(await readFile('eval/cases.json', 'utf8')) as {
    sql?: string;
  }[];
  expect(cases).toHaveLength(50);
  for (const c of cases.filter((c) => c.sql)) {
    const sql = await validateSql(c.sql!);
    const r = await db.query(sql);
    expect(r.rows.length).toBeGreaterThan(0);
  }
}, 60000);
it('September decline is observable without claiming causation', async () => {
  const r = await db.query<{ month: string; sales: string }>(
    "SELECT to_char(o.ordered_at,'YYYY-MM') AS month,sum(i.quantity*i.unit_price) sales FROM demo.orders o JOIN demo.order_items i ON i.order_id=o.id WHERE o.status='completed' AND o.ordered_at>=DATE '2026-08-01' GROUP BY 1 ORDER BY 1",
  );
  expect(Number(r.rows[1].sales)).toBeLessThan(Number(r.rows[0].sales));
});
it('database privileges deny direct writes even when AST validation is bypassed', async () => {
  await db.exec('SET ROLE analyst');
  try {
    await expect(db.exec('DELETE FROM demo.orders')).rejects.toThrow();
    await expect(db.exec('DROP TABLE demo.orders')).rejects.toThrow();
    await expect(
      db.exec('CREATE TABLE demo.stolen(id integer)'),
    ).rejects.toThrow();
    await expect(
      db.query("SELECT pg_read_file('/etc/passwd')"),
    ).rejects.toThrow();
    expect(
      (await db.query('SELECT count(*) FROM demo.orders')).rows.length,
    ).toBe(1);
  } finally {
    await db.exec('RESET ROLE');
  }
});
it('read-only transaction independently rejects writes', async () => {
  await db.exec('BEGIN READ ONLY');
  try {
    await expect(db.exec('UPDATE demo.products SET price=0')).rejects.toThrow();
  } finally {
    await db.exec('ROLLBACK');
  }
});
it('SQL alternatives with different aliases yield equal results', async () => {
  const a = await db.query<Row>(
    'SELECT count(*)::integer AS a FROM demo.products',
  );
  const b = await db.query<Row>(
    'SELECT sum(1)::integer AS b FROM demo.products',
  );
  const toTable = (q: typeof a): Table => ({
    columns: q.fields.map((f) => f.name),
    rows: q.rows,
    truncated: false,
  });
  expect(sameResult(toTable(a), toTable(b))).toBe(true);
});
