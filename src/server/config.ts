import { z } from 'zod';
const liveSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1),
  DATABASE_URL: z.string().startsWith('postgres'),
});
export function readConfig() {
  const mode = process.env.AGENT_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live')
    throw new Error('AGENT_MODE must be demo or live');
  if (mode === 'demo') return { mode } as const;
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
  return { mode, ...values.data, prices } as const;
}
