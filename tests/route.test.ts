import { it, expect, vi, afterEach } from 'vitest';
import { POST } from '../app/api/analyze/route';
afterEach(() => vi.unstubAllEnvs());
it('demo returns labeled NDJSON progress without API or DB settings', async () => {
  vi.stubEnv('AGENT_MODE', 'demo');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  const r = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ question: '先月の売上' }),
    }),
  );
  expect(r.status).toBe(200);
  const lines = (await r.text())
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x));
  expect(lines[0].type).toBe('step');
  expect(lines[1].result.mode).toBe('demo');
  expect(lines[1].result.attempts).toBe(0);
});
it('rejects invalid and oversized requests', async () => {
  vi.stubEnv('AGENT_MODE', 'demo');
  const r = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ question: '' }),
    }),
  );
  expect(r.status).toBe(400);
  const big = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'content-length': '99999' },
      body: '{}',
    }),
  );
  expect(big.status).toBe(413);
});
it('live with missing configuration is not silently replaced by a fixture', async () => {
  vi.stubEnv('AGENT_MODE', 'live');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  expect(
    (
      await POST(
        new Request('http://localhost/api/analyze', {
          method: 'POST',
          body: '{}',
        }),
      )
    ).status,
  ).toBe(503);
});
it('live requires an access token even when the Host looks local', async () => {
  vi.stubEnv('AGENT_MODE', 'live');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-placeholder');
  vi.stubEnv('ANTHROPIC_MODEL', 'test-placeholder');
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/demo');
  vi.stubEnv('AGENT_ACCESS_TOKEN', '');
  expect(
    (
      await POST(
        new Request('http://localhost/api/analyze', {
          method: 'POST',
          body: '{}',
        }),
      )
    ).status,
  ).toBe(401);
});
it('accepts the real same-origin Host and rejects a foreign Origin', async () => {
  vi.stubEnv('AGENT_MODE', 'live');
  vi.stubEnv('AGENT_PROVIDER', 'codex');
  vi.stubEnv('CODEX_MODEL', 'test-placeholder');
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/analytics');
  vi.stubEnv('AGENT_ACCESS_TOKEN', 'test-access-token-0123456789');
  for (const [origin, status] of [
    ['http://127.0.0.1:3001', 400],
    ['https://foreign.example', 403],
  ] as const) {
    const response = await POST(
      new Request('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: {
          host: '127.0.0.1:3001',
          origin,
          authorization: 'Bearer test-access-token-0123456789',
        },
        body: '{}',
      }),
    );
    expect(response.status).toBe(status);
  }
});
it('refuses a short access token and an oversized body without a length header', async () => {
  vi.stubEnv('AGENT_MODE', 'live');
  vi.stubEnv('AGENT_PROVIDER', 'codex');
  vi.stubEnv('CODEX_MODEL', 'test-placeholder');
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/analytics');
  vi.stubEnv('AGENT_ACCESS_TOKEN', 'short-token');
  const short = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { authorization: 'Bearer short-token' },
      body: '{}',
    }),
  );
  expect(short.status).toBe(503);
  vi.stubEnv('AGENT_MODE', 'demo');
  const big = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ question: 'x'.repeat(70000) }),
    }),
  );
  expect(big.status).toBe(413);
});
