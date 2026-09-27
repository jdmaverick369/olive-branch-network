import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Run against a local dev server. This only inspects layouts; no wallet actions.
const origin = process.env.LAYOUT_TEST_ORIGIN || 'http://127.0.0.1:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/stake-earn-contribute`);
    const consent = page.getByRole('button', { name: 'I Agree', exact: true });
    await consent.waitFor({ state: 'visible' });
    await consent.click();
    await page.waitForFunction(() => localStorage.getItem('obnDashboardConsent') === 'agree');
    let cases = 0;
    for (const route of ['stake-earn-contribute', 'profile', 'stake-earn-contribute/0']) {
      for (const width of [320, 360, 384, 430, 1280]) {
        for (const mode of ['text', 'root']) {
          for (const scale of [1, 1.25, 1.5, 2]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`${origin}/${route}`, { waitUntil: 'domcontentloaded' });
            const target = route === 'profile' ? '.impact-pending' : route.endsWith('/0') ? '.pool-detail-header' : '.pool-list-card';
            await page.locator(target).first().waitFor();
            // These routes choose their mobile layout in an effect after hydration.
            // Wait for that choice before measuring the final layout.
            if (width < 768) await page.waitForFunction(() => {
              const main = document.querySelector('main');
              if (!main) return false;
              const style = getComputedStyle(main);
              return style.transform === 'none' && style.zoom === '1';
            }, null, { timeout: 5000 }).catch(async error => {
              console.error({ route, width, mode, scale, main: await page.locator('main').evaluateAll(els => els.map(el => ({ transform: getComputedStyle(el).transform, zoom: getComputedStyle(el).zoom }))) });
              throw error;
            });
            // The disconnected profile omits claim controls. Insert inert buttons to
            // exercise the same crowded row without connecting or impersonating a wallet.
            if (route === 'profile') await page.locator('.impact-pending > :last-child').evaluate(el => {
              el.innerHTML = '<button class="px-3 py-1.5 text-xs">Claim All</button><button class="px-3 py-1.5 text-xs">Auto On</button>';
            });
            await page.evaluate(({ scale, mode }) => {
              if (mode === 'root') {
                document.documentElement.style.fontSize = `${16 * scale}px`;
                return;
              }
              // Text-only enlargement is a stress test, not Android WebView emulation.
              const sizes = [...document.querySelectorAll('body *')].map(el => {
                const style = getComputedStyle(el);
                return [el, parseFloat(style.fontSize), parseFloat(style.lineHeight)];
              });
              for (const [el, size, line] of sizes) {
                el.style.fontSize = `${size * scale}px`;
                if (Number.isFinite(line)) el.style.lineHeight = `${line * scale}px`;
              }
            }, { scale, mode });
            await page.waitForTimeout(100);
            const errors = await page.evaluate(() => {
              const errors = [];
              const selectors = ['.pool-list-card', '.impact-overview', '.impact-pending', '.pool-detail-header', '.pool-detail-stats', '.pool-actions'];
              for (const selector of selectors) {
                for (const parent of document.querySelectorAll(selector)) {
                  const bounds = parent.getBoundingClientRect();
                  if (bounds.left < -1 || bounds.right > innerWidth + 1) errors.push(`${selector} extends outside viewport`);
                  if (parent.scrollWidth > parent.clientWidth + 2) errors.push(`${selector} overflows by ${parent.scrollWidth - parent.clientWidth}px`);
                  const children = [...parent.children].filter(el => el.getBoundingClientRect().width > 0);
                  for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
                    const a = children[i].getBoundingClientRect(), b = children[j].getBoundingClientRect();
                    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push(`${selector} children overlap`);
                  }
                }
              }
              const cards = [...document.querySelectorAll('.pool-list-card')];
              for (let i = 1; i < cards.length; i++) {
                if (cards[i].getBoundingClientRect().top - cards[i-1].getBoundingClientRect().bottom < 7) errors.push('Nonprofit card gap lost');
              }
              for (const label of document.querySelectorAll('.impact-label')) {
                if (label.scrollWidth > label.clientWidth + 1) errors.push('Impact label overflows');
              }
              return errors;
            });
            assert.deepEqual(errors, [], `${route}, ${width}px, ${mode} ${scale * 100}%`);
            cases++;
          }
        }
      }
      console.log(`Checked ${route}`);
    }
    console.log(`Passed ${cases} responsive layout cases (3 pages, 5 widths, 4 sizes, text-only and root-font scaling).`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
