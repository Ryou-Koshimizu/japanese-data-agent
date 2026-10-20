import type { Page } from '@playwright/test';

/**
 * Waits until fonts are loaded, entrance animations (fades, rises, counting
 * numbers, SQL typing) have finished, so checks see the screen people read.
 * Looping decoration (background drift, blinking caret) never finishes and is
 * ignored.
 */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      !document.querySelector('.sql.typing:not(.art-sql .sql)') &&
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== 'running' ||
            a.effect?.getComputedTiming().endTime === Infinity,
        ),
  );
  // Counting numbers run on requestAnimationFrame for at most 1.6s.
  await page.waitForTimeout(1700);
}
