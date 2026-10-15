import { describe, it, expect } from 'vitest';
import { validateSql } from '../src/core/validator';
describe('SELECT許可リスト', () => {
  const safe = [
    'SELECT id FROM demo.orders WHERE id BETWEEN 1 AND 10',
    'SELECT id FROM demo.orders WHERE id IN (1,2,3)',
    'SELECT count(*) FROM demo.orders',
    'SELECT sum(quantity * unit_price) FROM demo.order_items',
    'WITH totals AS (SELECT product_id, sum(quantity) n FROM demo.order_items GROUP BY product_id) SELECT * FROM totals',
    "SELECT to_char(ordered_at,'YYYY-MM') FROM demo.orders",
    'SELECT p.category,sum(i.quantity*(i.unit_price-p.cost)) FROM demo.products p JOIN demo.order_items i ON p.id=i.product_id GROUP BY 1',
    'SELECT lag(id) OVER (ORDER BY id) FROM demo.orders',
    'SELECT 1 AS n /* DELETE */',
    "SELECT 'DROP TABLE demo.orders' AS message",
  ];
  it.each(safe)('accepts %s', async (sql) => {
    expect(await validateSql(sql)).toBeTruthy();
  });
  const unsafe = [
    'INSERT INTO demo.orders VALUES(1)',
    'UPDATE demo.orders SET id=2',
    'DELETE FROM demo.orders',
    'DROP TABLE demo.orders',
    'TRUNCATE demo.orders',
    "COPY demo.orders TO '/tmp/leak'",
    'SELECT 1; DELETE FROM demo.orders',
    'SELECT * INTO temp stolen FROM demo.orders',
    'SELECT * FROM demo.orders FOR UPDATE',
    'WITH removed AS (DELETE FROM demo.orders RETURNING *) SELECT * FROM removed',
    'SELECT pg_sleep(2)',
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT set_config('statement_timeout','0',false)",
    "SELECT nextval('sequence')",
    "SELECT dblink('remote','SELECT 1')",
    'SELECT * FROM pg_catalog.pg_authid',
    'SELECT * FROM information_schema.tables',
    'SELECT * FROM other.orders',
    'SELECT demo.sum(id) FROM demo.orders',
    'SELECT * FROM generate_series(1,10)',
    'WITH RECURSIVE r AS (SELECT 1 UNION ALL SELECT 1 FROM r) SELECT * FROM r',
    'SELECT 1::regclass',
    'SELECT 1 OPERATOR(demo.+) 2',
    'WITH orders AS (SELECT 1) SELECT * FROM orders',
    'DO $$ BEGIN DELETE FROM demo.orders; END $$',
    'EXPLAIN SELECT * FROM demo.orders',
    'SELECT * FROM demo.orders TABLESAMPLE SYSTEM(1)',
    // A CTE name reused outside its scope resolves to the real catalog.
    'WITH a AS (SELECT rolname, rolsuper FROM pg_roles), pg_roles AS (SELECT 1) SELECT * FROM a',
    'SELECT name, setting FROM pg_settings WHERE EXISTS (WITH pg_settings AS (SELECT 1) SELECT 1 FROM pg_settings)',
    // INTO and FOR UPDATE inside a set operation.
    'SELECT * INTO stolen FROM demo.orders UNION ALL SELECT * FROM demo.orders',
    'SELECT id FROM demo.orders UNION SELECT id FROM demo.orders FOR UPDATE',
  ];
  it.each(unsafe)('rejects %s', async (sql) => {
    await expect(validateSql(sql)).rejects.toThrow();
  });
  it('rejects empty and oversized SQL', async () => {
    await expect(validateSql('')).rejects.toThrow();
    await expect(validateSql(' '.repeat(12001))).rejects.toThrow();
  });
});
