import { requestSchema, type Analysis, type RequestInput } from './contracts';

// Clarification turns must not disappear: short replies need their question.
export function conversationHistory(
  cards: { question: string; result: Analysis }[],
): RequestInput['history'] {
  let history = cards
    .filter((c) => c.result.kind !== 'error')
    .slice(-6)
    .map((c) => ({
      question: c.question,
      kind: c.result.kind,
      sql: c.result.sql.slice(0, 12000),
      summary: c.result.message.slice(0, 1500),
      evidence: (c.result.evidence ?? []).slice(0, 4).map((e) => {
        const columns = e.table.columns.slice(0, 8).map((x) => x.slice(0, 60));
        return {
          label: e.label.slice(0, 200),
          sql: e.sql.slice(0, 4000),
          columns,
          rows: e.table.rows
            .slice(0, 8)
            .map((row) =>
              Object.fromEntries(
                e.table.columns
                  .slice(0, 8)
                  .map((col, i) => [
                    columns[i],
                    typeof row[col] === 'string'
                      ? row[col].slice(0, 200)
                      : (row[col] ?? null),
                  ]),
              ),
            ),
          truncated:
            e.table.truncated ||
            e.table.rows.length > 8 ||
            e.table.columns.length > 8,
        };
      }),
    }));
  while (JSON.stringify(history).length > 48000) history = history.slice(1);
  return requestSchema.shape.history.parse(history);
}

export function analysisMarkdown(question: string, result: Analysis): string {
  const parts = [
    '# 分析メモ',
    `質問: ${question}`,
    `モード: ${result.mode === 'demo' ? '固定回答デモ（AI・DB未実行）' : '実AI / 架空ECデータ'}`,
    result.message,
  ];
  for (const finding of result.report?.findings ?? [])
    parts.push(`- ${finding.text}（根拠 ${finding.evidenceIds.join(', ')}）`);
  if (result.report?.limitations.length)
    parts.push(
      '## 分からないこと・制約',
      ...result.report.limitations.map((x) => `- ${x}`),
    );
  for (const [i, e] of (
    result.evidence ?? [{ label: '集計', sql: result.sql, table: result.table }]
  ).entries()) {
    parts.push(
      `## 根拠 ${i + 1}: ${e.label}`,
      e.sql
        .split('\n')
        .map((x) => `    ${x}`)
        .join('\n'),
      `結果${e.table.truncated ? '（省略あり）' : ''}:`,
      JSON.stringify(e.table.rows.slice(0, 25), null, 2)
        .split('\n')
        .map((x) => `    ${x}`)
        .join('\n'),
    );
  }
  parts.push(
    '注意: 数値の分解は因果関係の証明ではありません。基準日2026-10-01。',
    `実行: ${result.elapsedMs}ms / ${result.attempts} SQL実行 / 入力${result.usage.inputTokens}・出力${result.usage.outputTokens} tokens`,
  );
  return parts.join('\n\n');
}
