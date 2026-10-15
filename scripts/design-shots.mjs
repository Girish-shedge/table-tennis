/**
 * Visual QA. Captures every multiplayer screen at four viewports.
 * Needs `npm run dev` on :5173 and the relay on :8787 (cd server; npm run dev).
 * Usage: node scripts/design-shots.mjs <tag>   (tag = before | after | anything)
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const tag = process.argv[2] ?? "after";
const base = process.env.APP ?? "http://localhost:5173";
const out = `design-shots/${tag}`;
mkdirSync(out, { recursive: true });

const sizes = {
  "360": { width: 360, height: 740 },
  "768": { width: 768, height: 1024 },
  "1280": { width: 1280, height: 800 },
  land: { width: 740, height: 360 },
};
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(sizes);

const messages = [
  "roomNotFound", "roomExpired", "matchStarted", "roomEnded", "hostExpired", "friendLeft",
  "friendEnded", "unreachable", "update", "resting", "duplicate", "inactivity",
];

const browser = await chromium.launch();

async function shot(page, name, size) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-${size}.png` });
}

async function mp(page, fn, arg) {
  await page.evaluate(([f, a]) => {
    const api = window.__mp;
    return new Function("api", "a", f)(api, a);
  }, [fn, arg]);
}

for (const size of only) {
  const viewport = sizes[size];

  // ---- Forced screens, one context -------------------------------------
  const ctx = await browser.newContext({ viewport, hasTouch: size !== "1280", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}/`);
  await page.waitForSelector("#mp-entry:not([hidden])");
  await shot(page, "01-start", size);
  await page.getByTestId("play-friend").click();
  await shot(page, "01b-friend-dialog", size);
  await page.getByTestId("friend-cancel").click();

  await mp(page, "api.dispatch({type:'host'})");
  await shot(page, "02-creating", size);
  await mp(page, "api.dispatch({type:'createSlow'})");
  await shot(page, "02b-creating-slow", size);
  await mp(page, "api.dispatch({type:'created',code:'KTQR',token:'t',playerId:'p'}); api.setExpiry(Date.now()+102000)");
  await shot(page, "03-host-lobby", size);
  await mp(page, "api.setExpiry(Date.now()+18000)");
  await shot(page, "03b-host-lobby-urgent", size);
  await mp(page, "api.dispatch({type:'peerJoined',name:'Ravi'})");
  await shot(page, "04-host-ready", size);
  await mp(page, "api.dispatch({type:'startRejected',message:'notConnected'})");
  await shot(page, "04b-host-not-connected", size);
  await mp(page, "api.dispatch({type:'backToMenu'}); api.dispatch({type:'openJoin'})");
  await shot(page, "05-join-code", size);
  await mp(page, "api.dispatch({type:'backToMenu'}); api.patch({nameSaved:false}); api.dispatch({type:'openLink',code:'KTQR',hostName:'Girish'})");
  await shot(page, "06-invite", size);
  await mp(page, "api.dispatch({type:'joined',token:'t',playerId:'p',hostName:'Girish'})");
  await shot(page, "07-guest-lobby", size);
  await mp(page, "api.dispatch({type:'guestStart'})");
  await shot(page, "08-countdown", size);
  await mp(page, "api.dispatch({type:'askLeave'})");
  await shot(page, "13-leave-dialog", size);
  await mp(page, "api.dispatch({type:'backToMenu'})");

  // ---- vs Bot: power bar, serve preview, scoreboard, leave dialog -------
  await page.getByTestId("play-bot").click();
  await page.locator('.option[data-mode="medium"]').click();
  await page.waitForTimeout(1200);
  await shot(page, "15-bot-serve-soft", size);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(480);
  await page.keyboard.up("ArrowDown");
  await shot(page, "15b-bot-serve-sweet", size);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowDown");
  await shot(page, "15c-bot-serve-risky", size);
  await page.keyboard.press("Escape");
  await shot(page, "15d-bot-leave", size);
  await page.getByTestId("bot-leave").click();
  for (const key of messages) {
    await mp(page, "api.dispatch({type:'backToMenu'}); api.dispatch({type:'roomClosed',message:a})", key);
    await shot(page, `14-msg-${key}`, size);
  }
  await ctx.close();

  // ---- Real two-player match for in-match chrome -----------------------
  const hostCtx = await browser.newContext({ viewport, hasTouch: size !== "1280", deviceScaleFactor: 1 });
  const guestCtx = await browser.newContext({ viewport, hasTouch: size !== "1280", deviceScaleFactor: 1 });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto(`${base}/?drive=miss`);
  await host.getByTestId("play-friend").click();
  await host.getByTestId("host-game").click();
  await host.getByTestId("room-code").waitFor();
  const code = (await host.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  await guest.goto(`${base}/?drive=miss`);
  await guest.getByTestId("play-friend").click();
  await guest.getByTestId("join-code").click();
  for (let i = 0; i < 4; i++) await guest.getByTestId(`code-${i}`).fill(code[i]);
  await guest.getByTestId("guest-wait").waitFor();
  await host.getByTestId("mp-start").click();
  await host.getByTestId("countdown").waitFor();
  await shot(host, "08-countdown-live", size);
  await host.getByTestId("connection").waitFor({ state: "visible", timeout: 10000 });
  await host.waitForTimeout(2500);
  await shot(host, "09-match", size);
  await shot(guest, "09-match-guest", size);
  await host.getByTestId("chat-toggle").click();
  await shot(host, "09a-chat-open", size);
  await host.getByTestId("emote-0").click();
  await host.waitForTimeout(150);
  await shot(host, "09b-emote-self", size);
  await guest.waitForTimeout(100);
  await shot(guest, "09c-emote-friend", size);
  await mp(host, "api.dispatch({type:'disconnected'})");
  await shot(host, "10-reconnect", size);
  await mp(host, "api.dispatch({type:'reconnected'}); api.dispatch({type:'askLeave'})");
  await shot(host, "13-leave-over-match", size);
  await mp(host, "api.dispatch({type:'stay'}); api.dispatch({type:'matchOver',youWon:true,you:11,them:7})");
  await shot(host, "11-result-win", size);
  await mp(host, "api.dispatch({type:'rematch'})");
  await shot(host, "12-rematch-waiting", size);
  await mp(host, "api.dispatch({type:'rematchTimeout'}); api.dispatch({type:'peerRematch'})");
  await shot(host, "12b-rematch-wanted", size);
  await mp(host, "api.dispatch({type:'backToMenu'}); api.dispatch({type:'host'}); api.dispatch({type:'cancel'})");
  await hostCtx.close();
  await guestCtx.close();
}

await browser.close();
console.log(`shots in ${out}`);
