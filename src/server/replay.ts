import type { Analysis } from '../core/contracts';
import { normalizeQuestion } from '../core/replays';
import conversations from '../../docs/evidence/conversations-first-pass.json';
import presentation from '../../docs/evidence/presentation-demo.json';

type Recorded = { question: string; result: unknown };

// Real responses recorded with docs/evidence provenance (provider, model,
// source hash). Replaying them makes no AI call and runs no SQL.
const recorded: Recorded[] = [
  presentation as Recorded,
  ...(conversations.results as Recorded[]),
];

const byQuestion = new Map(
  recorded.map((r) => [normalizeQuestion(r.question), r.result as Analysis]),
);

export const replaySource = {
  provider: conversations.provider,
  model: conversations.model,
  recordedAt: conversations.timestamp,
};

/** Recorded real response for an exact recorded question, labelled as replay. */
export function replayAnswer(question: string): Analysis | undefined {
  const result = byQuestion.get(normalizeQuestion(question));
  return result ? { ...result, mode: 'replay' } : undefined;
}
