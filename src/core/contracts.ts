import { z } from 'zod';
const cellSchema = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.null(),
]);
const historyEvidenceSchema = z.object({
  label: z.string().max(200),
  sql: z.string().max(4000),
  columns: z.array(z.string().max(60)).max(8),
  rows: z.array(z.record(z.string().max(60), cellSchema)).max(8),
  truncated: z.boolean(),
});
export const requestSchema = z.object({
  question: z.string().trim().min(1).max(1500),
  history: z
    .array(
      z.object({
        question: z.string().max(1500),
        sql: z.string().max(12000),
        summary: z.string().max(1500),
        kind: z.enum(['answer', 'clarify', 'refuse', 'error']).optional(),
        evidence: z.array(historyEvidenceSchema).max(4).optional(),
      }),
    )
    .max(6)
    .default([]),
});
export const planSchema = z.object({
  kind: z.enum(['query', 'explain', 'clarify', 'refuse']),
  sql: z.string().max(12000),
  message: z.string().max(1500),
  queries: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        sql: z.string().min(1).max(12000),
      }),
    )
    .max(4)
    .default([]),
});
export const summarySchema = z.object({
  summary: z.string().min(1).max(1500),
  findings: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        evidenceIds: z.array(z.number().int().min(1).max(4)).min(1).max(4),
      }),
    )
    .max(6)
    .default([]),
  limitations: z.array(z.string().min(1).max(500)).max(4).default([]),
  nextQuestions: z.array(z.string().min(1).max(300)).max(3).default([]),
});
export type RequestInput = z.infer<typeof requestSchema>;
export type Plan = z.input<typeof planSchema>;
export type Report = z.infer<typeof summarySchema>;
export type Row = Record<string, string | number | boolean | null>;
export type Table = { columns: string[]; rows: Row[]; truncated: boolean };
export type Usage = { inputTokens: number; outputTokens: number };
export type Evidence = { label: string; sql: string; table: Table };
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
  /** demo: fixed sample. replay: recorded real AI response. live: real AI now. */
  mode: 'demo' | 'replay' | 'live';
  errorCode?: string;
  evidence?: Evidence[];
  report?: Report;
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
    evidence?: Evidence[],
  ): Promise<{ value: string; usage: Usage; report?: Report }>;
}
export interface QueryExecutor {
  execute(sql: string, signal?: AbortSignal): Promise<Table>;
}
export const emptyTable: Table = { columns: [], rows: [], truncated: false };
