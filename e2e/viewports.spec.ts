import { test, expect, type Page } from '@playwright/test';
import { settle } from './settle';

// Every screen size the demo has to work on, in CSS px (width x height),
// including a folded phone, landscape phones, tablets and a 4K desktop.
const sizes: [number, number][] = [
  [280, 653],
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [393, 852],
  [412, 915],
  [430, 932],
  [568, 320],
  [667, 375],
  [844, 390],
  [932, 430],
  [600, 960],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1024, 1366],
  [1180, 820],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

type Box = { name: string; x: number; y: number; w: number; h: number };

/** Layout facts measured in the page after fonts load and entrances finish. */
async function measure(page: Page) {
  await settle(page);
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden';
    };
    const box = (name: string, el: Element | null): Box[] => {
      if (!el || !visible(el)) return [];
      const r = el.getBoundingClientRect();
      return [{ name, x: r.left, y: r.top, w: r.width, h: r.height }];
    };
    const q = (s: string) => document.querySelector(s);
    const hero = q('.hero')!.getBoundingClientRect();
    const header = q('.topbar')!.getBoundingClientRect();
    // Blocks that must sit side by side or stacked, never on top of each other.
    const blocks = [
      ...box('meta', q('.hero-meta')),
      ...box('h1', q('.hero h1')),
      ...box('lede', q('.hero .lede')),
      ...box('composer', q('.composer')),
      ...box('art', q('.hero-art')),
    ];
    // Everything that has to be on the first screen without scrolling.
    const content = [
      ...blocks,
      ...box('mode', q('.mode')),
      ...box('input', q('#question')),
      ...box('submit', q('.composer button[type=submit]')),
      ...box('label', q('.composer label')),
      ...box('jump', q('.jump')),
      ...box('brand', q('.brand')),
      ...box('nav', q('.topnav')),
    ];
    // Text that is cut off shows up as content wider/taller than its box.
    const clipped = [
      ...document.querySelectorAll(
        '.topbar a, .topbar button, .hero h1, .hero .lede, .mode, .composer label, .composer button, .composer small, .jump, .examples button, .section-heading, .dataset, .notice',
      ),
    ]
      .filter(visible)
      .flatMap((el) => [el, ...el.querySelectorAll('*')])
      .filter(visible)
      .filter((el) => {
        // Overflow that stays visible is drawn, and a scroll area can be
        // scrolled (by keyboard too). Hidden or clipped overflow is cut text.
        const s = getComputedStyle(el);
        const hides = (v: string) => v === 'hidden' || v === 'clip';
        return (
          (hides(s.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
          (hides(s.overflowY) && el.scrollHeight > el.clientHeight + 1)
        );
      })
      .map((el) => el.className || el.tagName);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      header: { top: header.top, height: header.height },
      hero: { top: hero.top, height: hero.height },
      blocks,
      content,
      clipped,
      brandNav: [box('brand', q('.brand'))[0], box('nav', q('.topnav'))[0]],
    };
  });
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.5 &&
  b.x < a.x + a.w - 0.5 &&
  a.y < b.y + b.h - 0.5 &&
  b.y < a.y + a.h - 0.5;

for (const [width, height] of sizes) {
  test(`${width}x${height}: ヘッダー80px・ヒーローが最初の画面に収まり、横にはみ出さない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const m = await measure(page);
    expect(m.scrollWidth, '横スクロール').toBeLessThanOrEqual(width);
    expect(m.header.top).toBe(0);
    expect(m.header.height).toBe(80);
    expect(m.hero.top).toBeCloseTo(80, 0);
    expect(m.hero.height).toBeCloseTo(height - 80, 0);
    for (const b of m.content) {
      expect(b.x, `${b.name} の左端`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${b.name} の上端`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, `${b.name} の右端`).toBeLessThanOrEqual(width + 0.5);
      expect(b.y + b.h, `${b.name} の下端`).toBeLessThanOrEqual(height + 0.5);
    }
    for (const [i, a] of m.blocks.entries())
      for (const b of m.blocks.slice(i + 1))
        expect(overlaps(a, b), `${a.name} と ${b.name} の重なり`).toBe(false);
    const [brand, nav] = m.brandNav;
    expect(overlaps(brand, nav), 'ロゴと操作の重なり').toBe(false);
    expect(m.clipped, '欠けた文字').toEqual([]);

    // The answer screen must not overflow either.
    await page
      .getByRole('button', { name: '地域別の売上を比較して', exact: false })
      .click();
    await expect(
      page.getByRole('region', { name: '分析結果 1' }),
    ).toBeFocused();
    await page.getByText('集計表 · 5行').click();
    await page.getByText('生成SQLを確認').click();
    const after = await measure(page);
    expect(after.scrollWidth, '回答後の横スクロール').toBeLessThanOrEqual(
      width,
    );
    expect(after.header.height).toBe(80);
  });
}
