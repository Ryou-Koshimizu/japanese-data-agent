import { Pool } from 'pg';
import Cursor from 'pg-cursor';
import type { QueryExecutor, Row } from '../core/contracts';
import { validateSql } from '../core/validator';
export function postgresExecutor(
  connectionString: string,
): QueryExecutor & { close(): Promise<void> } {
  const pool = new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  return {
    async close() {
      await pool.end();
    },
    async execute(rawSql, signal) {
      const sql = await validateSql(rawSql);
      signal?.throwIfAborted();
      const client = await pool.connect();
      try {
        const role = await client.query(
          `SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = current_user`,
        );
        if (!role.rows.length || Object.values(role.rows[0]).some(Boolean))
          throw Object.assign(new Error('Unsafe DB role'), {
            code: 'UNSAFE_ROLE',
          });
        const privileges = await client.query(`SELECT
          has_schema_privilege(current_user, 'demo', 'CREATE') OR has_schema_privilege(current_user, 'public', 'CREATE') AS unsafe_schema,
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='demo' AND
          (has_table_privilege(current_user, format('%I.%I',table_schema,table_name), 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR table_type <> 'BASE TABLE')) AS unsafe_tables`);
        if (
          privileges.rows[0]?.unsafe_schema ||
          privileges.rows[0]?.unsafe_tables
        )
          throw Object.assign(new Error('Unsafe privileges'), {
            code: 'UNSAFE_ROLE',
          });
        await client.query('BEGIN READ ONLY');
        await client.query('SET LOCAL search_path = pg_catalog, demo');
        await client.query("SET LOCAL statement_timeout = '5s'");
        await client.query("SET LOCAL lock_timeout = '1s'");
        const cursor = client.query(new Cursor(sql));
        const rows = await new Promise<Record<string, unknown>[]>(
          (resolve, reject) =>
            cursor.read(1001, (error, records) =>
              error ? reject(error) : resolve(records),
            ),
        );
        await new Promise<void>((resolve, reject) =>
          cursor.close((error) => (error ? reject(error) : resolve())),
        );
        signal?.throwIfAborted();
        await client.query('ROLLBACK');
        const columns = rows.length ? Object.keys(rows[0]) : [];
        if (columns.length > 30)
          throw Object.assign(new Error('Too many columns'), {
            code: 'RESULT_TOO_WIDE',
          });
        const normalized: Row[] = rows.slice(0, 1000).map((row) =>
          Object.fromEntries(
            columns.map((key) => {
              const v = row[key];
              return [
                key,
                v instanceof Date
                  ? v.toISOString().slice(0, 10)
                  : typeof v === 'string'
                    ? /^-?\d+(?:\.\d+)?$/.test(v) &&
                      Math.abs(Number(v)) <= Number.MAX_SAFE_INTEGER
                      ? Number(v)
                      : v.slice(0, 1000)
                    : typeof v === 'number' ||
                        typeof v === 'boolean' ||
                        v === null
                      ? v
                      : String(v).slice(0, 1000),
              ];
            }),
          ),
        );
        let bytes = 0;
        let count = 0;
        for (const row of normalized) {
          bytes += Buffer.byteLength(JSON.stringify(row), 'utf8');
          if (bytes > 1000000) break;
          count++;
        }
        return {
          columns,
          rows: normalized.slice(0, count),
          truncated: rows.length > 1000 || count < normalized.length,
        };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
