import { requestSchema, type Event } from '../../../src/core/contracts';
import { analyze } from '../../../src/core/harness';
import { readConfig } from '../../../src/server/config';
import { demoAnswer } from '../../../src/server/demo';
import { modelProvider } from '../../../src/server/provider';
import { postgresExecutor } from '../../../src/adapters/postgres';
import { timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function authorized(token: string, request: Request) {
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
let running = 0;
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 64000)
    return Response.json({ error: '入力が大きすぎます。' }, { status: 413 });
  let config;
  try {
    config = readConfig();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
  if (config.mode === 'live') {
    const token = process.env.AGENT_ACCESS_TOKEN;
    const url = new URL(request.url);

    if (!token || (token && !authorized(token, request)))
      return Response.json(
        { error: '実AIにはアクセス用トークンが必要です。' },
        { status: 401 },
      );
    const origin = request.headers.get('origin');
    // Next's internal request URL can use localhost while the browser uses
    // 127.0.0.1. Compare with the actual HTTP Host, not a forwarded host.
    const expectedOrigin = `${url.protocol}//${request.headers.get('host') ?? url.host}`;
    if (origin && origin !== expectedOrigin)
      return Response.json(
        { error: 'Originが一致しません。' },
        { status: 403 },
      );
    if (running >= 2)
      return Response.json({ error: '同時実行の上限です。' }, { status: 429 });
  }
  let input;
  try {
    const text = await request.text();
    if (text.length > 64000) throw new Error();
    input = requestSchema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      { error: '質問または履歴の形式が不正です。' },
      { status: 400 },
    );
  }
  const encoder = new TextEncoder();
  let cancelled = false;
  const executionAbort = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) => {
        if (!cancelled)
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      if (config.mode === 'demo') {
        send({ type: 'step', stage: '固定回答デモ' });
        send({ type: 'result', result: demoAnswer(input.question) });
        controller.close();
        return;
      }
      running++;
      const db = postgresExecutor(config.DATABASE_URL);
      const signal = AbortSignal.any([
        request.signal,
        executionAbort.signal,
        AbortSignal.timeout(120000),
      ]);
      try {
        const result = await analyze(input, {
          model: modelProvider(config),
          db,
          onEvent: send,
          signal,
          prices: config.prices,
        });
        console.info(
          JSON.stringify({
            event: 'analysis_complete',
            kind: result.kind,
            elapsedMs: result.elapsedMs,
            usage: result.usage,
            attempts: result.attempts,
          }),
        );
      } catch {
        if (!cancelled)
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                message:
                  '分析を完了できませんでした。設定と実行時間を確認してください。',
              }) + '\n',
            ),
          );
      } finally {
        running--;
        await db.close();
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      executionAbort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
