/** A11y/motion QA (PRD §10.2). Needs `npm run dev` on :5173. */
import { chromium } from "@playwright/test";

const base = process.env.APP ?? "http://localhost:5173";
const browser = await chromium.launch();
const res = {};

// 1. Touch targets at 360 across screens
{
  const page = await (await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true })).newPage();
  await page.goto(base + "/");
  await page.waitForSelector("#mp-entry:not([hidden])");
  const small = [];
  const scan = async (label) => {
    const r = await page.evaluate(() =>
      [...document.querySelectorAll("button, input, a")]
        .filter((e) => e.offsetParent !== null && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden")
        .map((e) => {
          const b = e.getBoundingClientRect();
          return { id: e.id || e.className || e.tagName, w: Math.round(b.width), h: Math.round(b.height), t: (e.textContent || "").trim().slice(0, 20) };
        })
        .filter((b) => b.w < 44 || b.h < 44),
    );
    if (r.length) small.push({ label, r });
  };
  await scan("start");
  const steps = [
    ["host-lobby", "api.dispatch({type:'host'}); api.dispatch({type:'created',code:'KTQR',token:'t',playerId:'p'}); api.setExpiry(Date.now()+100000)"],
    ["host-ready", "api.dispatch({type:'peerJoined',name:'Ravi'})"],
    ["result", "api.dispatch({type:'result',winner:'you',you:11,them:7})"],
  ];
  for (const [l, f] of steps) {
    await page.evaluate((f) => new Function("api", f)(window.__mp), f).catch(() => {});
    await page.waitForTimeout(400);
    await scan(l);
  }
  res.touchTargetsUnder44 = small;
}

// 2. Reduced motion: no running animations
{
  const page = await (await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: "reduce" })).newPage();
  await page.goto(base + "/");
  await page.waitForSelector("#mp-entry:not([hidden])");
  await page.evaluate(() => {
    const api = window.__mp;
    api.dispatch({ type: "host" });
    api.dispatch({ type: "created", code: "KTQR", token: "t", playerId: "p" });
    api.setExpiry(Date.now() + 15000);
  });
  await page.waitForTimeout(600);
  res.reducedMotionRunningAnimations = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().duration > 1).length,
  );
}

// 3. Keyboard focus ring + live region
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(base + "/");
  await page.waitForSelector("#mp-entry:not([hidden])");
  const rings = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    rings.push(
      await page.evaluate(() => {
        const e = document.activeElement;
        const s = getComputedStyle(e);
        return { el: e.id || e.tagName, outline: s.outlineStyle + " " + s.outlineWidth };
      }),
    );
  }
  res.tabFocus = rings;
  await page.evaluate(() => {
    const api = window.__mp;
    api.dispatch({ type: "host" });
    api.dispatch({ type: "created", code: "KTQR", token: "t", playerId: "p" });
    api.setExpiry(Date.now() + 61000);
  });
  await page.waitForTimeout(2500);
  res.liveText = await page.textContent("#mp-live");
  res.liveAttrs = await page.getAttribute("#mp-live", "aria-live");
}

console.log(JSON.stringify(res, null, 1));
await browser.close();
