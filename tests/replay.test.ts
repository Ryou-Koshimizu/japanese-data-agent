import { it, expect, vi, afterEach } from 'vitest';
import { POST } from '../app/api/analyze/route';
import {
  replayScenarios,
  nextReplayQuestion,
  normalizeQuestion,
} from '../src/core/replays';
import { replayAnswer } from '../src/server/replay';
import conversations from '../docs/evidence/conversations-first-pass.json';
import presentation from '../docs/evidence/presentation-demo.json';
afterEach(() => vi.unstubAllEnvs());

const recordedQuestions = new Set(
  [presentation, ...conversations.results].map((r) =>
    normalizeQuestion(r.question),
  ),
);

it('every scenario question has a recorded real response', () => {
  for (const s of replayScenarios)
    for (const q of s.questions) {
      expect(recordedQuestions.has(normalizeQuestion(q)), q).toBe(true);
      const r = replayAnswer(q)!;
      expect(r.mode).toBe('replay');
    }
});

it('scenario turns follow the recorded conversation order', () => {
  for (const s of replayScenarios.filter((x) => x.id !== 'presentation')) {
    const recorded = conversations.results
      .filter((r) => r.scenario === s.id)
      .map((r) => r.question);
    expect(s.questions).toEqual(recorded);
  }
  expect(nextReplayQuestion('人気の商品を知りたい。')).toBe(
    replayScenarios[1].questions[1],
  );
  expect(nextReplayQuestion(replayScenarios[1].questions[2])).toBeUndefined();
});

it('replay keeps the recorded result and never claims a new live run', () => {
  const refused = replayAnswer(replayScenarios[3].questions[1])!;
  expect(refused.kind).toBe('refuse');
  expect(refused.sql).toBe('');
  const investigation = replayAnswer(replayScenarios[0].questions[0])!;
  expect(investigation.evidence?.length).toBe(3);
  expect(replayAnswer('記録にない質問')).toBeUndefined();
});

it('demo route replays recorded questions and labels the stream', async () => {
  vi.stubEnv('AGENT_MODE', 'demo');
  const r = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ question: '人気の商品を知りたい。' }),
    }),
  );
  const lines = (await r.text())
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x));
  expect(lines[0].stage).toContain('記録済みの実AI応答を再生');
  expect(lines.at(-1).result.mode).toBe('replay');
  expect(lines.at(-1).result.kind).toBe('clarify');
});
