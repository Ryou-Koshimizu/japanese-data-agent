// UI-only replay of a previously recorded real response. No new AI calls.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sourcePath = await readFile('reports/presentation-demo.json', 'utf8')
  .then(() => 'reports/presentation-demo.json')
  .catch(() => 'docs/evidence/presentation-demo.json');
const source = await readFile(sourcePath, 'utf8');
await mkdir('reports', { recursive: true });
const { question, result } = JSON.parse(source);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.route('**/api/analyze', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: JSON.stringify({ type: 'result', result }) + '\n',
    }),
  );
  await page.goto('http://127.0.0.1:3000');
  const input = page.getByRole('textbox', {
    name: 'データへの質問',
    exact: false,
  });
  await input.fill(question);
  await input.press('Enter');
  const region = page.getByRole('region', { name: '分析結果 1' });
  await region.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('heading', { name: '分からないこと・制約' }).waitFor();
  await page.locator('.graph svg').waitFor();
  // Move focus off the skip link and screenshot the actual result viewport,
  // rather than stitching a sticky sidebar into a several-page screenshot.
  await region.focus();
  await region.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'reports/conversation-desktop-final.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= 390);
  await region.focus();
  await region.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'reports/conversation-mobile-final.png' });
  await writeFile(
    'reports/conversation-capture.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        mode: 'UI replay of recorded real AI result; no new inference',
        source: sourcePath,
        sourceSha256: createHash('sha256').update(source).digest('hex'),
      },
      null,
      2,
    ),
  );
  console.log(
    'Saved desktop/mobile result viewports (recorded-response replay, not another AI evaluation).',
  );
} finally {
  await browser.close();
}
