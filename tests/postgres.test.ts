import { it, expect } from 'vitest';
import { Pool } from 'pg';
import { postgresExecutor } from '../src/adapters/postgres';
const enabled = process.env.RUN_POSTGRES_TESTS === '1';
it.skipIf(!enabled)(
  '実PostgreSQLは読み取りを許可し直接の更新を拒否する',
  async () => {
    const url =
      'postgresql://analyst:analyst_local_only@127.0.0.1:54324/analytics';
    const db = postgresExecutor(url);
    const pool = new Pool({ connectionString: url });
    try {
      const result = await db.execute('SELECT count(*) AS n FROM demo.orders');
      expect(result.rows[0].n).toBe(50000);
      await expect(pool.query('DELETE FROM demo.orders')).rejects.toThrow();
      await expect(
        pool.query("SELECT pg_read_file('/etc/passwd')"),
      ).rejects.toThrow();
      const big = await db.execute('SELECT id FROM demo.orders ORDER BY id');
      expect(big.rows).toHaveLength(1000);
      expect(big.truncated).toBe(true);
    } finally {
      await pool.end();
      await db.close();
    }
  },
);
it.skipIf(!enabled)('管理者接続は分析経路で拒否する', async () => {
  const db = postgresExecutor(
    'postgresql://postgres:postgres_local_only@127.0.0.1:54324/analytics',
  );
  try {
    await expect(
      db.execute('SELECT count(*) FROM demo.orders'),
    ).rejects.toMatchObject({ code: 'UNSAFE_ROLE' });
  } finally {
    await db.close();
  }
});
