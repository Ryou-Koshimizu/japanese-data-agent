import { test, expect } from '@playwright/test';
import { postgresExecutor } from '../src/adapters/postgres';
import { sameResult } from '../src/eval/compare';
import type { Analysis } from '../src/core/contracts';
import { mkdir, writeFile } from 'node:fs/promises';
import { analysisMarkdown } from '../src/core/conversation';

test('実ローカルAPIがトークンなしのリクエストを拒否する', async ({
  request,
}) => {
  const response = await request.post('/api/analyze', {
    data: { question: '顧客の総数は？' },
  });
  expect(response.status()).toBe(401);
});

test('実AIで売上変化を調査し、根拠と限界を画面・分析メモで示す', async ({
  page,
}) => {
  const token = process.env.AGENT_ACCESS_TOKEN;
  if (!token || !process.env.DATABASE_URL)
    throw new Error('Live test needs local configuration');
  await page.addInitScript(() => {
    const state = window as unknown as { analysisBodies: string[] };
    state.analysisBodies = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]).endsWith('/api/analyze'))
        response
          .clone()
          .text()
          .then((body) => state.analysisBodies.push(body));
      return response;
    };
  });
  await page.goto('/');
  await page.getByText('アクセス用トークン', { exact: true }).click();
  await page.getByRole('textbox', { name: 'アクセス用トークン' }).fill(token);
  const question =
    '先月の売上が落ちた理由を調べて。前月と比較し、月別売上・地域別の差額・カテゴリ別の差額を独立した3つの集計で示して。月別は年月YYYY-MM・売上、地域別とカテゴリ別は名前・8月売上・9月売上・差額の順で、名前昇順にして。';
  const input = page.getByRole('textbox', {
    name: 'データへの質問',
    exact: false,
  });
  await input.fill(question);
  await input.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { analysisBodies: string[] }).analysisBodies
            .length,
      ),
    )
    .toBe(1);
  const body = await page.evaluate(
    () => (window as unknown as { analysisBodies: string[] }).analysisBodies[0],
  );
  const result = body
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x))
    .find((e) => e.type === 'result')?.result as Analysis;
  expect(result.kind).toBe('answer');
  expect(result.evidence).toHaveLength(3);
  expect(result.report?.findings.length).toBeGreaterThan(0);
  expect((result.report?.limitations ?? []).join(' ')).toMatch(
    /因果|断定|原因/,
  );
  const db = postgresExecutor(process.env.DATABASE_URL);
  try {
    const gold = await db.execute(
      "SELECT to_char(o.ordered_at,'YYYY-MM'),sum(i.quantity*i.unit_price) FROM demo.orders o JOIN demo.order_items i ON i.order_id=o.id WHERE o.status='completed' AND o.ordered_at>=DATE '2026-08-01' AND o.ordered_at<DATE '2026-10-01' GROUP BY 1 ORDER BY 1",
    );
    expect(result.evidence!.some((e) => sameResult(e.table, gold, true))).toBe(
      true,
    );
  } finally {
    await db.close();
  }
  const region = page.getByRole('region', { name: '分析結果 1' });
  await expect(region.getByText('分からないこと・制約')).toBeVisible();
  await region
    .locator('.analysis-notes details')
    .first()
    .locator('summary')
    .click();
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/presentation-demo.json',
    JSON.stringify({ question, result }, null, 2),
  );
  await writeFile(
    'reports/presentation-demo.md',
    analysisMarkdown(question, result),
  );
  await page.screenshot({
    path: 'reports/conversation-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'reports/conversation-mobile.png',
    fullPage: true,
  });
  const download = page.waitForEvent('download');
  await region.getByRole('button', { name: '分析メモを保存' }).click();
  expect((await download).suggestedFilename()).toBe('analysis-note.md');
});

test('ChatGPTで分析・文脈を引き継いだ再集計・CSV保存まで動く', async ({
  page,
}) => {
  const token = process.env.AGENT_ACCESS_TOKEN;
  if (!token || !process.env.DATABASE_URL)
    throw new Error('Live test needs local configuration');
  // Capture the browser's own streamed response. CDP getResponseBody is not
  // reliable for a consumed streaming fetch in recent Chromium versions.
  await page.addInitScript(() => {
    const state = window as unknown as { analysisBodies: string[] };
    state.analysisBodies = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]).endsWith('/api/analyze'))
        response
          .clone()
          .text()
          .then((body) => state.analysisBodies.push(body));
      return response;
    };
  });
  await page.goto('/');
  await expect(page.getByText('実AI · ChatGPTサブスクで実行')).toBeVisible();
  await page.getByText('アクセス用トークン', { exact: true }).click();
  await page.getByRole('textbox', { name: 'アクセス用トークン' }).fill(token);
  const input = page.getByRole('textbox', {
    name: 'データへの質問',
    exact: false,
  });
  const db = postgresExecutor(process.env.DATABASE_URL);
  try {
    for (const [question, predicate] of [
      ['先月の売上合計は？', ''],
      ['それを東京だけで', "AND c.region='東京'"],
    ]) {
      await input.fill(question);
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/analyze') && r.request().method() === 'POST',
      );
      await input.press('Enter');
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const bodyCount = predicate ? 2 : 1;
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { analysisBodies: string[] }).analysisBodies
                .length,
          ),
        )
        .toBe(bodyCount);
      const body = await page.evaluate(() =>
        (window as unknown as { analysisBodies: string[] }).analysisBodies.at(
          -1,
        )!,
      );
      const events = body
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const result = events.find((e) => e.type === 'result')
        ?.result as Analysis;
      expect(result?.kind).toBe('answer');
      expect(result.mode).toBe('live');
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      const expected = await db.execute(
        `SELECT sum(i.quantity*i.unit_price) AS n FROM demo.orders o JOIN demo.order_items i ON o.id=i.order_id JOIN demo.customers c ON c.id=o.customer_id WHERE o.status='completed' AND o.ordered_at>=DATE '2026-09-01' AND o.ordered_at<DATE '2026-10-01' ${predicate}`,
      );
      expect(sameResult(result.table, expected)).toBe(true);
      await expect(
        page.getByRole('region', { name: `分析結果 ${predicate ? 2 : 1}` }),
      ).toBeFocused();
    }
    const result = page.getByRole('region', { name: '分析結果 2' });
    await result.getByText('集計表 · 1行').click();
    const downloadPromise = page.waitForEvent('download');
    await result.getByRole('button', { name: 'CSVを保存' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('analysis.csv');
    await download.saveAs('reports/live-result.csv');
    await result.getByText('生成SQLを確認').click();
    await expect(result.locator('pre')).toContainText('SELECT');
    await page.screenshot({
      path: 'reports/live-ui-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: 'reports/live-ui-mobile.png',
      fullPage: true,
    });
  } finally {
    await db.close();
  }
});
