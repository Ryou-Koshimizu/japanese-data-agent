import { parse, deparse } from 'pgsql-parser';
import { tables } from './schema';
export class UnsafeSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeSqlError';
  }
}
const functions = new Set([
  'sum',
  'count',
  'avg',
  'min',
  'max',
  'round',
  'abs',
  'ceil',
  'ceiling',
  'floor',
  'date_trunc',
  'to_char',
  'extract',
  'date_part',
  'coalesce',
  'nullif',
  'greatest',
  'least',
  'lower',
  'upper',
  'length',
  'substring',
  'concat',
  'lag',
  'lead',
  'row_number',
  'rank',
  'dense_rank',
]);
const types = new Set([
  'int2',
  'int4',
  'int8',
  'integer',
  'bigint',
  'smallint',
  'numeric',
  'decimal',
  'float4',
  'float8',
  'real',
  'double precision',
  'text',
  'varchar',
  'bpchar',
  'date',
  'timestamp',
  'timestamptz',
  'interval',
  'bool',
  'boolean',
]);
const operators = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<>',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '~~',
  '!~~',
  '~~*',
  '!~~*',
  '||',
  'BETWEEN',
  'NOT BETWEEN',
  'BETWEEN SYMMETRIC',
  'NOT BETWEEN SYMMETRIC',
]);
type Obj = Record<string, unknown>;
const strings = (v: unknown): string[] =>
  (v as { String?: { sval: string } }[]).map((x) => x.String?.sval ?? '');
export async function validateSql(sql: string): Promise<string> {
  if (!sql.trim() || sql.length > 12000)
    throw new UnsafeSqlError('SQLの長さが許可範囲外です。');
  let ast: Awaited<ReturnType<typeof parse>>;
  try {
    ast = await parse(sql);
  } catch {
    throw new UnsafeSqlError('SQLの構文を解析できません。');
  }
  if (
    ast.stmts?.length !== 1 ||
    !(ast.stmts[0]?.stmt as Record<string, unknown>)?.SelectStmt
  )
    throw new UnsafeSqlError('SELECT単文のみ実行できます。');
  const ctes = new Set<string>();
  function collect(v: unknown) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(collect);
    const obj = v as Obj;
    if (obj.CommonTableExpr) {
      const name = (obj.CommonTableExpr as Obj).ctename as string;
      if (tables.includes(name as (typeof tables)[number]))
        throw new UnsafeSqlError('CTEが許可テーブルを隠しています。');
      // CTE names are collected for the whole query, but PostgreSQL resolves
      // them by scope: a pg_* name used outside its scope reaches the catalog
      // through search_path (pg_catalog first). Every catalog relation is pg_*.
      if (/^pg_/i.test(name))
        throw new UnsafeSqlError('CTEの名前にpg_は使えません。');
      ctes.add(name);
    }
    Object.values(obj).forEach(collect);
  }
  collect(ast);
  let count = 0;
  function inspect(v: unknown, depth = 0) {
    if (!v || typeof v !== 'object') return;
    if (++count > 10000 || depth > 100)
      throw new UnsafeSqlError('SQLが複雑すぎます。');
    if (Array.isArray(v)) return v.forEach((x) => inspect(x, depth + 1));
    const obj = v as Obj;
    for (const [key, value] of Object.entries(obj)) {
      if (
        (key.endsWith('Stmt') && key !== 'SelectStmt') ||
        [
          'IntoClause',
          // INTO and FOR UPDATE inside UNION branches are stored without the
          // SelectStmt wrapper, under these lower-case keys.
          'intoClause',
          'lockingClause',
          'RangeFunction',
          'RangeTableFunc',
          'RangeTableSample',
          'LockingClause',
          'SQLValueFunction',
          'CollateClause',
        ].includes(key)
      )
        throw new UnsafeSqlError('許可されていないSQL操作です。');
      if (key === 'SelectStmt') {
        const s = value as Obj;
        if (s.intoClause || s.lockingClause)
          throw new UnsafeSqlError('書き込み・ロックは禁止です。');
      }
      if (
        (key === 'WithClause' || key === 'withClause') &&
        (value as Obj).recursive
      )
        throw new UnsafeSqlError('再帰クエリは禁止です。');
      if (key === 'RangeVar') {
        const r = value as Obj;
        if (
          r.catalogname ||
          (r.schemaname && r.schemaname !== 'demo') ||
          (!tables.includes(r.relname as (typeof tables)[number]) &&
            !(!r.schemaname && ctes.has(r.relname as string)))
        )
          throw new UnsafeSqlError('許可外のテーブルです。');
      }
      if (key === 'FuncCall') {
        const names = strings((value as Obj).funcname);
        if (
          (names.length === 2 && names[0] !== 'pg_catalog') ||
          names.length > 2 ||
          !functions.has(names.at(-1)!)
        )
          throw new UnsafeSqlError('許可外の関数です。');
      }
      if (key === 'TypeName' || key === 'typeName') {
        const names = strings((value as Obj).names);
        if (
          (names.length === 2 && names[0] !== 'pg_catalog') ||
          names.length > 2 ||
          !types.has(names.at(-1)!)
        )
          throw new UnsafeSqlError('許可外の型です。');
      }
      if (key === 'A_Expr' && (value as Obj).name) {
        const names = strings((value as Obj).name);
        if (names.length !== 1 || !operators.has(names[0]))
          throw new UnsafeSqlError('許可外の演算子です。');
      }
      // x op ANY/ALL (subquery) carries its operator on the SubLink.
      const operName = key === 'SubLink' ? (value as Obj).operName : undefined;
      if (Array.isArray(operName) && operName.length) {
        const names = strings(operName);
        if (names.length !== 1 || !operators.has(names[0]))
          throw new UnsafeSqlError('許可外の演算子です。');
      }
      inspect(value, depth + 1);
    }
  }
  inspect(ast);
  return (await deparse(ast)).replace(/;\s*$/, '');
}
