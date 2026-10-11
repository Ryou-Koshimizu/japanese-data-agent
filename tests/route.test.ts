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
