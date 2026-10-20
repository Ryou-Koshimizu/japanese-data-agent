import { it, expect } from 'vitest';
import { statesCausalLimit } from '../e2e/causal';
import presentation from '../docs/evidence/presentation-demo.json';

it('recognises the causal caveats the real AI wrote', () => {
  // Recorded answers (docs/evidence) and the 2026-10-20 live run.
  expect(statesCausalLimit(presentation.result.report.limitations)).toBe(true);
  expect(
    statesCausalLimit([
      '注文数・販売数量・単価の内訳がないため、売上減少の直接的な要因は未特定です。広告・天候・顧客心理などの影響を検証するには、それぞれの追加データが必要です。',
    ]),
  ).toBe(true);
  expect(
    statesCausalLimit([
      '数値分解は増減がどこに計上されたかを示すもので、因果関係を示しません。',
    ]),
  ).toBe(true);
});

it('does not accept a cause stated as fact or a caveat about something else', () => {
  expect(statesCausalLimit(['売上減少の原因は広告の停止です。'])).toBe(false);
  expect(statesCausalLimit(['対象は2026年8月・9月のcompleted注文です。'])).toBe(
    false,
  );
  expect(statesCausalLimit([])).toBe(false);
});
