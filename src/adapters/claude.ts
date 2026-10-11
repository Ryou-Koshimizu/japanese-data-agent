import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import {
  planSchema,
  summarySchema,
  type ModelProvider,
} from '../core/contracts';
import { planInstructions, summaryInstructions } from './prompts';
import { evidencePrompt } from './evidence';
export function claudeProvider(apiKey: string, modelId: string): ModelProvider {
  const model = createAnthropic({ apiKey })(modelId);
  const base = { model, maxOutputTokens: 4000, maxRetries: 0 };
  return {
    async plan(input, repair, signal) {
      const result = await generateText({
        ...base,
        abortSignal: signal,
        output: Output.object({ schema: planSchema }),
        system: planInstructions,
        prompt: JSON.stringify({
          question: input.question,
          untrustedHistory: input.history,
          repair,
        }),
      });
      return {
        value: result.output,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      };
    },
    async summarize(question, sql, table, signal, evidence) {
      const result = await generateText({
        ...base,
        maxOutputTokens: 1800,
        abortSignal: signal,
        output: Output.object({ schema: summarySchema }),
        system: summaryInstructions,
        prompt: JSON.stringify({
          question,
          evidence: evidencePrompt(sql, table, evidence),
        }),
      });
      return {
        value: result.output.summary,
        report: result.output,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      };
    },
  };
}
