import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['tablet', 768, 1024]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: '청약 일정 자세히 보기' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/screenshots/${name}-home.png`, fullPage: true });
  await page.goto('http://localhost:5173/#calendar');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await page.getByRole('button', { name: /2026-11-02, 일정/ }).click();
  await page.screenshot({ path: `docs/screenshots/${name}-calendar.png`, fullPage: true });
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: '청약 일정 자세히 보기' }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `docs/screenshots/${name}-detail.png` });
  console.log(`${name}: captured 3 live-data screens; runtime errors=${errors.length}`);
  if (errors.length) throw new Error(errors.join('\n'));
  await page.close();
}
await browser.close();
