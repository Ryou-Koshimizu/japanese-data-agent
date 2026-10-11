import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
const url = process.env.ADMIN_DATABASE_URL;
if (!url) throw new Error('ADMIN_DATABASE_URLを設定してください。');
const address = new URL(url);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) ||
  address.pathname !== '/analytics'
)
  throw new Error('seedはローカルの専用analytics DBだけに許可されています。');
const pool = new Pool({ connectionString: url });
const c = await pool.connect();
try {
  await c.query('BEGIN');
  await c.query('SELECT pg_advisory_xact_lock(4242)');
  const existing = await c.query('SELECT count(*) FROM demo.customers');
  if (Number(existing.rows[0].count) > 0) {
    console.log('既存データがあります。変更せず終了しました。');
    await c.query('ROLLBACK');
  } else {
    await c.query(
      await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8'),
    );
    await c.query('COMMIT');
    console.log(
      'Seed 42: 5,000 customers / 300 products / 50,000 orders / 120,000 items / 30 campaigns',
    );
  }
} catch (e) {
  await c.query('ROLLBACK');
  throw e;
} finally {
  c.release();
  await pool.end();
}
