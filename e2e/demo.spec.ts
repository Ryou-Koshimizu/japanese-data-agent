import { test, expect } from '@playwright/test';
test('質問から固定回答・SQL・表まで確認できる', async ({ page }) => {
  await page.goto('/');
  if (process.env.CAPTURE_DEMO) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: '.captures/start.png', caret: 'initial' });
  }
  await expect(page.getByText('固定回答デモ · API不要')).toBeVisible();
  await page
    .getByRole('button', { name: '先月の売上トップ10の商品は？' })
    .click();
  await expect(
    page.getByText('これは画面確認用の固定回答です。', { exact: false }),
  ).toBeVisible();
  if (process.env.CAPTURE_DEMO) {
    await page.locator('.exchange').scrollIntoViewIfNeeded();
    await page.mouse.move(5, 5);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: '.captures/result.png', caret: 'initial' });
  }
  await page.getByText('生成SQLを確認').click();
  await expect(
    page.getByText('-- 固定回答デモ：SQLは実行されていません'),
  ).toBeVisible();
  if (process.env.CAPTURE_DEMO) {
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.answer details').nth(1).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.captures/sql.png', caret: 'initial' });
  }
  await page.getByText('集計表 · 10行').click();
  await expect(
    page.getByRole('cell', { name: 'サンプル商品 1', exact: true }),
  ).toBeVisible();
});
test('モバイルで横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('textbox', { name: 'データへの質問' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
