import { mkdir, writeFile, rename, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { conversationCases } from '../eval/conversations';
import { analyze } from '../src/core/harness';
import { conversationHistory } from '../src/core/conversation';
import { sameResult } from '../src/eval/compare';
import { modelProvider, modelId } from '../src/server/provider';
import { readConfig } from '../src/server/config';
import { postgresExecutor } from '../src/adapters/postgres';
import type { Analysis } from '../src/core/contracts';
const config = readConfig();
if (config.mode !== 'live')
  throw new Error('Conversation eval requires live mode');
const digest = createHash('sha256');
for (const dir of ['src', 'app', 'scripts', 'db', 'eval'])
  for (const path of (await readdir(dir, { recursive: true })).sort())
    if (/\.(ts|tsx|css|sql|json)$/.test(path)) {
      digest.update(`${dir}/${path}\n`);
      digest.update(await readFile(`${dir}/${path}`));
    }
const sourceSha256 = digest
  .update(await readFile('package-lock.json'))
  .digest('hex');
const promptsSha256 = createHash('sha256')
  .update(await readFile('src/adapters/prompts.ts'))
  .digest('hex');
const suiteSha256 = createHash('sha256')
  .update(await readFile('eval/conversations.ts'))
  .digest('hex');
await mkdir('reports', { recursive: true });
const file = `reports/conversations-${Date.now()}.json`;
const results: {
  scenario: string;
  turn: number;
  question: string;
  passed: boolean;
  checks: Record<string, boolean>;
  result: Analysis;
}[] = [];
const metadata = {
  timestamp: new Date().toISOString(),
  provider: config.provider,
  model: modelId(config),
  effort: config.provider === 'codex' ? config.CODEX_EFFORT : null,
  sourceSha256,
  promptsSha256,
  suiteSha256,
  seed: 42,
  referenceDate: '2026-10-01',
  plannedTurns: conversationCases.reduce((n, c) => n + c.turns.length, 0),
  protocol:
    'First-pass suite; gold never sent to model. Subsequent reruns are regression, not fresh holdout.',
  costJpy: null,
};
const checkpoint = async (status: string) => {
  const report = {
    ...metadata,
    status,
    completedTurns: results.length,
    passed: results.filter((r) => r.passed).length,
    accuracy: results.length
      ? results.filter((r) => r.passed).length / results.length
      : null,
    results,
  };
  await writeFile(`${file}.tmp`, JSON.stringify(report, null, 2));
  await rename(`${file}.tmp`, file);
};
console.log(
  `Conversation evaluation: ${config.provider}/${modelId(config)}; ${metadata.plannedTurns} turns; ${file}`,
);
await checkpoint('in_progress');
const db = postgresExecutor(config.DATABASE_URL),
  model = modelProvider(config);
let providerErrors = 0,
  interrupted = false;
try {
  outer: for (const scenario of conversationCases) {
    const cards: { question: string; result: Analysis }[] = [];
    for (const [i, turn] of scenario.turns.entries()) {
      const expected = await Promise.all(
        (turn.gold ?? []).map((sql) => db.execute(sql)),
      );
      let executions = 0;
      const result = await analyze(
        { question: turn.question, history: conversationHistory(cards) },
        {
          model,
          db: {
            execute: async (sql, signal) => {
              executions++;
              return db.execute(sql, signal);
            },
          },
          signal: AbortSignal.timeout(120000),
        },
      );
      const actual = result.evidence?.map((e) => e.table) ?? [result.table];
      const used = new Set<number>();
      const matches = expected.every((table) => {
        const j = actual.findIndex(
          (other, j) => !used.has(j) && sameResult(other, table, turn.ordered),
        );
        if (j < 0) return false;
        used.add(j);
        return true;
      });
      const checks = {
        kind: result.kind === (turn.kind ?? 'answer'),
        gold:
          !expected.length || (actual.length === expected.length && matches),
        noExecution: !(turn.noExecution || turn.kind) || executions === 0,
        grounded: !!turn.kind || !!result.report?.findings.length,
        causalLimit:
          !turn.causalLimit ||
          /因果|断定|原因.*(?:不明|限界|でき|分から)/.test(
            (result.report?.limitations ?? []).join(' '),
          ),
        realUsage: result.usage.inputTokens > 0,
      };
      const passed = Object.values(checks).every(Boolean);
      results.push({
        scenario: scenario.id,
        turn: i + 1,
        question: turn.question,
        passed,
        checks,
        result,
      });
      cards.push({ question: turn.question, result });
      console.log(
        `${passed ? 'PASS' : 'FAIL'} ${scenario.id}/${i + 1} ${JSON.stringify(checks)}`,
      );
      await checkpoint('in_progress');
      providerErrors =
        result.kind === 'error' && result.errorCode?.startsWith('CODEX_')
          ? providerErrors + 1
          : 0;
      if (providerErrors >= 2) {
        interrupted = true;
        break outer;
      }
    }
  }
} finally {
  await db.close();
}
await checkpoint(interrupted ? 'provider_unavailable' : 'complete');
console.log(file);
if (interrupted || results.some((r) => !r.passed)) process.exitCode = 1;
