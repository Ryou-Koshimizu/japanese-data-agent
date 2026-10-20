import { it, expect, vi, afterEach } from 'vitest';
import {
  parseCodexOutput,
  codexProvider,
  exitError,
} from '../src/adapters/codex';
import { readConfig } from '../src/server/config';
afterEach(() => vi.unstubAllEnvs());
const finish = JSON.stringify({
  type: 'turn.completed',
  usage: { input_tokens: 12, output_tokens: 6 },
});
const message = JSON.stringify({
  type: 'item.completed',
  item: {
    type: 'agent_message',
    text: '{"kind":"clarify","sql":"","message":"期間は？"}',
  },
});
it('accepts only completed structured inference and records real usage', () => {
  expect(parseCodexOutput(`${message}\n${finish}\n`)).toEqual({
    value: { kind: 'clarify', sql: '', message: '期間は？' },
    usage: { inputTokens: 12, outputTokens: 6 },
  });
});
it('rejects tool execution, failed or incomplete turns and invalid JSON', () => {
  for (const output of [
    message,
    finish,
    'not-json',
    `${message}\n{"type":"turn.failed"}`,
    `${message}\n${finish}\n{"type":"item.completed","item":{"type":"command_execution"}}`,
  ])
    expect(() => parseCodexOutput(output)).toThrow();
});
it('cancellation prevents starting a model subprocess', async () => {
  const signal = AbortSignal.abort();
  await expect(
    codexProvider({ model: 'unused', effort: 'auto' }).plan(
      { question: '件数は？', history: [] },
      undefined,
      signal,
    ),
  ).rejects.toThrow();
});
it('reports rate limits without exposing the original CLI error', () => {
  expect(() =>
    parseCodexOutput(
      JSON.stringify({
        type: 'turn.failed',
        error: { message: 'Usage limit reached: secret-connection-string' },
      }),
    ),
  ).toThrow('CODEX_RATE_LIMIT');
  expect(() =>
    parseCodexOutput(
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'error', message: 'Authentication failed 401' },
      }),
    ),
  ).toThrow('CODEX_AUTH_FAILED');
});
it('subscription configuration requires no Claude key and never estimates API billing', () => {
  vi.stubEnv('AGENT_MODE', 'live');
  vi.stubEnv('AGENT_PROVIDER', 'codex');
  vi.stubEnv('CODEX_MODEL', 'gpt-6.1-sol');
  vi.stubEnv('CODEX_EFFORT', 'auto');
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/analytics');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('INPUT_USD_PER_MILLION', '999');
  expect(readConfig()).toMatchObject({
    provider: 'codex',
    CODEX_EFFORT: 'auto',
    prices: undefined,
  });
  vi.stubEnv('CODEX_EFFORT', 'invalid');
  expect(() => readConfig()).toThrow();
});

const reconnect = JSON.stringify({
  type: 'error',
  message: 'Reconnecting... 2/5 (unexpected status 403 Forbidden)',
});
const fallback = JSON.stringify({
  type: 'item.completed',
  item: { type: 'error', message: 'Falling back from WebSockets to HTTPS' },
});
it('accepts a completed turn after transient reconnect notices', () => {
  expect(
    parseCodexOutput(`${reconnect}\n${fallback}\n${message}\n${finish}\n`),
  ).toEqual({
    value: { kind: 'clarify', sql: '', message: '期間は？' },
    usage: { inputTokens: 12, outputTokens: 6 },
  });
});
it('classifies a usage limit reported on stdout when the CLI exits non-zero', () => {
  const limit = 'You’ve hit your usage limit. Try again at 11:02 PM.';
  const stdout = [
    reconnect,
    fallback,
    JSON.stringify({ type: 'error', message: limit }),
    JSON.stringify({ type: 'turn.failed', error: { message: limit } }),
  ].join('\n');
  expect(exitError(stdout, 'websocket 403').message).toBe('CODEX_RATE_LIMIT');
  expect(exitError('', 'unexpected crash').message).toBe(
    'CODEX_INFERENCE_FAILED',
  );
  expect(() =>
    parseCodexOutput(
      `${message}\n${finish}\n${reconnect}\n{"type":"turn.failed"}`,
    ),
  ).toThrow('CODEX_INFERENCE_FAILED');
});
