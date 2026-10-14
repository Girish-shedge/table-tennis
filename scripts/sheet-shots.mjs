import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.APP ?? "http://localhost:5173";
mkdirSync("design-shots/after", { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [["360", { width: 360, height: 800 }], ["1280", { width: 1280, height: 900 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(`${base}/design.html`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `design-shots/after/00-components-${name}.png`, fullPage: true });
}
await browser.close();
