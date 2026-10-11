import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
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

test('各画面幅と低モーション設定で操作できる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
    [1440, 1000],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const input = page.getByRole('textbox', {
      name: 'データへの質問',
      exact: false,
    });
    await expect(input).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (process.env.CAPTURE_DEMO && [375, 1440].includes(width))
      await page.screenshot({
        path: `.captures/${width === 375 ? 'mobile' : 'desktop'}.png`,
        fullPage: true,
      });
    await page
      .getByRole('button', { name: '地域別の売上を比較して', exact: false })
      .click();
    await expect(
      page.getByRole('region', { name: '分析結果 1' }),
    ).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
test('通信失敗でも質問を残して再試行できる', async ({ page }) => {
  await page.route('**/api/analyze', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '通信を確認してください。' }),
    }),
  );
  await page.goto('/');
  const input = page.getByRole('textbox', {
    name: 'データへの質問',
    exact: false,
  });
  await input.fill('地域別の売上を比較して');
  await input.press('Enter');
  await expect(page.locator('.error[role=alert]')).toContainText(
    '通信を確認してください。',
  );
  await expect(input).toHaveValue('地域別の売上を比較して');
  await page.unroute('**/api/analyze');
  await page.getByRole('button', { name: 'もう一度試す' }).click();
  await expect(page.getByRole('region', { name: '分析結果 1' })).toBeFocused();
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: '新しい分析' }).click();
  await expect(input).toBeFocused();
  await expect(page.locator('.exchange')).toHaveCount(0);
});
test('初期画面と結果画面にaxeで検出されるWCAG A・AA違反がない', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const audit = async () =>
    new AxeBuilder({ page })
      .include('.shell')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
  expect((await audit()).violations).toEqual([]);
  await page
    .getByRole('button', { name: '先月の売上トップ10の商品は？', exact: false })
    .click();
  await expect(page.getByRole('region', { name: '分析結果 1' })).toBeVisible();
  await page.getByText('集計表 · 10行').click();
  await page.getByText('生成SQLを確認').click();
  expect((await audit()).violations).toEqual([]);
});
