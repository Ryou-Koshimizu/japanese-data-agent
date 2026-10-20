import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './settle';
import type { Analysis } from '../src/core/contracts';
test('確認履歴・複数根拠・次の質問・分析メモを操作できる（モデルモック）', async ({
  page,
}) => {
  const bodies: { question: string; history: { kind: string }[] }[] = [];
  const table = {
    columns: ['月', '売上'],
    rows: [
      { 月: '2026-08', 売上: 100 },
      { 月: '2026-09', 売上: 80 },
    ],
    truncated: false,
  };
  const answer: Analysis = {
    kind: 'answer',
    message: '20円減少しました。原因は断定できません。',
    sql: 'SELECT 1',
    table,
    chart: { type: 'line', x: '月', y: '売上' },
    attempts: 2,
    usage: { inputTokens: 10, outputTokens: 5 },
    elapsedMs: 10,
    costJpy: null,
    mode: 'live',
    evidence: [
      { label: '月別売上', sql: 'SELECT 1', table },
      {
        label: '地域別差額',
        sql: 'SELECT 2',
        table: {
          columns: ['地域', '差額'],
          rows: [{ 地域: '東京', 差額: -20 }],
          truncated: false,
        },
      },
    ],
    report: {
      summary: '20円減少しました。原因は断定できません。',
      findings: [
        { text: '売上は100円から80円へ減少。', evidenceIds: [1] },
        { text: '東京は20円減少。', evidenceIds: [2] },
      ],
      limitations: ['広告の因果効果はこのデータでは断定できません。'],
      nextQuestions: ['同じ期間の東京のカテゴリ別売上を比較して'],
    },
  };
  await page.route('**/api/analyze', async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const result =
      bodies.length === 1
        ? {
            ...answer,
            kind: 'clarify',
            message: '期間と指標を教えてください。',
            sql: '',
            evidence: [],
            report: undefined,
            table: { columns: [], rows: [], truncated: false },
            chart: { type: 'table' },
          }
        : answer;
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: JSON.stringify({ type: 'result', result }) + '\n',
    });
  });
  await page.goto('/');
  const input = page.getByRole('textbox', {
    name: 'データへの質問',
    exact: false,
  });
  await input.fill('最近の売上を調べて');
  await input.press('Enter');
  await expect(page.getByText('期間と指標を教えてください。')).toBeVisible();
  await input.fill('2026年8月と9月の売上');
  await input.press('Enter');
  const region = page.getByRole('region', { name: '分析結果 2' });
  await expect(region.getByText('調査の根拠 · 2件')).toBeVisible();
  expect(bodies[1].history[0].kind).toBe('clarify');
  await region.getByText('根拠 2: 地域別差額').click();
  await expect(
    region.getByRole('cell', { name: '東京', exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await region.getByRole('button', { name: '分析メモを保存' }).click();
  expect((await download).suggestedFilename()).toBe('analysis-note.md');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await settle(page);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.shell')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await region
    .getByRole('button', { name: '同じ期間の東京のカテゴリ別売上を比較して' })
    .click();
  await expect(page.getByRole('region', { name: '分析結果 3' })).toBeVisible();
  expect(bodies[2].question).toContain('東京');
});
