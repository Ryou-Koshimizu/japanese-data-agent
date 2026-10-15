import { requestSchema, type Event } from '../../../src/core/contracts';
import { analyze } from '../../../src/core/harness';
import { readConfig } from '../../../src/server/config';
import { demoAnswer } from '../../../src/server/demo';
import { replayAnswer } from '../../../src/server/replay';
import { modelProvider } from '../../../src/server/provider';
import { postgresExecutor } from '../../../src/adapters/postgres';
import { timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Live analysis may take up to the 120-second budget below.
export const maxDuration = 130;
const MAX_BODY = 64000;
// A shorter token can be guessed; generate it, e.g. `openssl rand -hex 24`.
const MIN_TOKEN = 24;
function authorized(token: string, request: Request) {
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Read the body, stopping as soon as it grows past the limit. */
async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
let running = 0;
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY)
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

    if (token && token.length < MIN_TOKEN)
      return Response.json(
        {
          error: `AGENT_ACCESS_TOKEN は${MIN_TOKEN}文字以上の乱数にしてください。`,
        },
        { status: 503 },
      );
    if (!token || !authorized(token, request))
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
  // Reserve the live slot before any await, so parallel requests cannot all
  // pass the check above; every exit path below gives it back exactly once.
  let held = config.mode === 'live';
  if (held) running++;
  const release = () => {
    if (held) {
      held = false;
      running--;
    }
  };
  let input;
  try {
    const text = await readBody(request);
    if (text === null) {
      release();
      return Response.json({ error: '入力が大きすぎます。' }, { status: 413 });
    }
    input = requestSchema.parse(JSON.parse(text));
  } catch {
    release();
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
        const replay = replayAnswer(input.question);
        if (replay) {
          send({
            type: 'step',
            stage: '記録済みの実AI応答を再生（新しいAI呼び出し・SQL実行なし）',
          });
          if (replay.sql) send({ type: 'sql', sql: replay.sql });
          send({ type: 'result', result: replay });
        } else {
          send({ type: 'step', stage: '固定回答デモ' });
          send({ type: 'result', result: demoAnswer(input.question) });
        }
        controller.close();
        return;
      }
      let db: ReturnType<typeof postgresExecutor> | undefined;
      try {
        db = postgresExecutor(config.DATABASE_URL);
        const signal = AbortSignal.any([
          request.signal,
          executionAbort.signal,
          AbortSignal.timeout(120000),
        ]);
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
        release();
        await db?.close().catch(() => {});
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
