import type { Analysis } from '../core/contracts';
import { selectChart } from '../core/chart';
export function demoAnswer(question: string): Analysis {
  const region = question.includes('地域');
  const margin = question.includes('粗利');
  const trend = question.includes('推移');
  const columns = trend
    ? ['月', '売上']
    : region
      ? ['地域', '売上']
      : margin
        ? ['カテゴリ', '粗利']
        : ['商品', '売上'];
  const values: (string | number)[][] = trend
    ? Array.from({ length: 12 }, (_, i) => [
        `${i < 3 ? 2025 : 2026}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`,
        Math.round(
          2500000 + i * 70000 + Math.sin(i) * 180000 - (i === 11 ? 750000 : 0),
        ),
      ])
    : region
      ? [
          ['東京', 3200000],
          ['大阪', 2410000],
          ['神奈川', 1900000],
          ['愛知', 1700000],
          ['福岡', 1310000],
        ]
      : margin
        ? [
            ['家電', 950000],
            ['食品', 810000],
            ['衣料', 720000],
            ['家具', 450000],
            ['美容', 390000],
          ]
        : Array.from({ length: 10 }, (_, i) => [
            `サンプル商品 ${i + 1}`,
            Math.round(650000 / (i + 1)),
          ]);
  const table = {
    columns,
    rows: values.map((v) =>
      Object.fromEntries(columns.map((c, i) => [c, v[i]])),
    ),
    truncated: false,
  };
  return {
    kind: 'answer',
    message:
      'これは画面確認用の固定回答です。質問内容に応じたAI分析やDB実行は行っていません。実AIモードでは自分のAPIキーで分析できます。',
    sql: '-- 固定回答デモ：SQLは実行されていません',
    table,
    chart: selectChart(table),
    attempts: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    elapsedMs: 0,
    costJpy: null,
    mode: 'demo',
  };
}
