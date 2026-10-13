import { it, expect } from 'vitest';
import { findingBlocks } from '../src/core/finding-text';

it('turns an embedded markdown table into a table block', () => {
  const blocks = findingBlocks(
    '地域別売上\n| 名前 | 差額 |\n|---|---:|\n| 東京 | -8円 |\n| 大阪 | -6円 |\n東京の減少額が最大です。',
  );
  expect(blocks).toEqual([
    { type: 'text', text: '地域別売上' },
    {
      type: 'table',
      columns: ['名前', '差額'],
      rows: [
        ['東京', '-8円'],
        ['大阪', '-6円'],
      ],
    },
    { type: 'text', text: '東京の減少額が最大です。' },
  ]);
});

it('keeps plain text and lone pipes as text', () => {
  expect(findingBlocks('売上は減少。 | 注記')).toEqual([
    { type: 'text', text: '売上は減少。 | 注記' },
  ]);
});
