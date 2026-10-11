import { analyze } from '../src/core/harness';
import { modelProvider } from '../src/server/provider';
import { postgresExecutor } from '../src/adapters/postgres';
import { readConfig } from '../src/server/config';
const config = readConfig();
if (config.mode !== 'live')
  throw new Error('CLI実AI実行にはAGENT_MODE=liveを設定してください。');
const question = process.argv.slice(2).join(' ');
if (!question) throw new Error('npm run ask -- "先月の売上は？"');
const db = postgresExecutor(config.DATABASE_URL);
try {
  const result = await analyze(
    { question, history: [] },
    {
      model: modelProvider(config),
      db,
      prices: config.prices,
      onEvent: (e) => {
        if (e.type !== 'result') console.log(JSON.stringify(e));
      },
      signal: AbortSignal.timeout(120000),
    },
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.kind === 'error') process.exitCode = 1;
} finally {
  await db.close();
}
