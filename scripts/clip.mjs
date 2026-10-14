import { chromium } from "@playwright/test";
const base = process.env.APP ?? "http://localhost:5173";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
await page.goto(`${base}/design.html`);
await page.waitForTimeout(900);
const groups = await page.locator(".group").all();
let i = 0;
for (const g of groups) {
  await g.screenshot({ path: `design-shots/after/sheet-${String(i++).padStart(2, "0")}.png` });
}
await browser.close();
