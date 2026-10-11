import { z } from 'zod';
const liveSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1),
  DATABASE_URL: z.string().startsWith('postgres'),
});
const codexSchema = z.object({
  CODEX_MODEL: z.string().min(1),
  CODEX_EFFORT: z
    .enum(['auto', 'low', 'medium', 'high', 'xhigh'])
    .default('auto'),
  DATABASE_URL: z.string().startsWith('postgres'),
});
export function readConfig() {
  const mode = process.env.AGENT_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live')
    throw new Error('AGENT_MODE must be demo or live');
  if (mode === 'demo') return { mode } as const;
  const provider = process.env.AGENT_PROVIDER ?? 'claude';
  if (provider === 'codex') {
    const values = codexSchema.safeParse(process.env);
    if (!values.success)
      throw new Error(
        'ChatGPTサブスク接続にはCODEX_MODEL、DATABASE_URLとログイン済みCodex CLIが必要です。',
      );
    return { mode, provider, ...values.data, prices: undefined } as const;
  }
  if (provider !== 'claude')
    throw new Error('AGENT_PROVIDER must be claude or codex');
  const values = liveSchema.safeParse(process.env);
  if (!values.success)
    throw new Error(
      '実AIにはANTHROPIC_API_KEY、ANTHROPIC_MODEL、DATABASE_URLの設定が必要です。',
    );
  const p = [
    process.env.INPUT_USD_PER_MILLION,
    process.env.OUTPUT_USD_PER_MILLION,
    process.env.JPY_PER_USD,
  ];
  const prices = p.every(
    (v) => v && Number.isFinite(Number(v)) && Number(v) >= 0,
  )
    ? { input: Number(p[0]), output: Number(p[1]), jpyPerUsd: Number(p[2]) }
    : undefined;
  return { mode, provider, ...values.data, prices } as const;
}
