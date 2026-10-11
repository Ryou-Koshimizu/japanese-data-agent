import { z } from 'zod';
export const requestSchema = z.object({
  question: z.string().trim().min(1).max(1500),
  history: z
    .array(
      z.object({
        question: z.string().max(1500),
        sql: z.string().max(12000),
        summary: z.string().max(1500),
      }),
    )
    .max(6)
    .default([]),
});
export const planSchema = z.object({
  kind: z.enum(['query', 'clarify', 'refuse']),
  sql: z.string().max(12000),
  message: z.string().max(1500),
});
export const summarySchema = z.object({ summary: z.string().min(1).max(1500) });
export type RequestInput = z.infer<typeof requestSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Row = Record<string, string | number | boolean | null>;
export type Table = { columns: string[]; rows: Row[]; truncated: boolean };
export type Usage = { inputTokens: number; outputTokens: number };
export type Chart = {
  type: 'line' | 'bar' | 'metric' | 'table';
  x?: string;
  y?: string;
};
export type Analysis = {
  kind: 'answer' | 'clarify' | 'refuse' | 'error';
  message: string;
  sql: string;
  table: Table;
  chart: Chart;
  attempts: number;
  usage: Usage;
  elapsedMs: number;
  costJpy: number | null;
  mode: 'demo' | 'live';
};
export type Event =
  | { type: 'step'; stage: string; attempt?: number }
  | { type: 'sql'; sql: string }
  | { type: 'result'; result: Analysis };
export interface ModelProvider {
  plan(
    input: RequestInput,
    repair?: { sql: string; code: string },
    signal?: AbortSignal,
  ): Promise<{ value: Plan; usage: Usage }>;
  summarize(
    question: string,
    sql: string,
    table: Table,
    signal?: AbortSignal,
  ): Promise<{ value: string; usage: Usage }>;
}
export interface QueryExecutor {
  execute(sql: string, signal?: AbortSignal): Promise<Table>;
}
export const emptyTable: Table = { columns: [], rows: [], truncated: false };
