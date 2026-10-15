import { expect, test, type Page } from "@playwright/test";

async function hostRoom(page: Page): Promise<string> {
  await page.goto("/?drive=miss");
  await page.getByTestId("play-friend").click();
  await page.getByTestId("host-game").click();
  await expect(page.getByTestId("room-code")).toBeVisible();
  return (await page.getByTestId("room-code").innerText()).replace(/\s+/g, "");
}

async function joinByCode(page: Page, code: string) {
  await page.goto("/?drive=miss");
  await page.getByTestId("play-friend").click();
  await page.getByTestId("join-code").click();
  for (let i = 0; i < 4; i++) await page.getByTestId(`code-${i}`).fill(code[i]);
  await expect(page.getByTestId("guest-wait")).toBeVisible();
}

test("two players finish a match, rematch, and leave", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const code = await hostRoom(host);
  await joinByCode(guest, code);
  await host.getByTestId("mp-start").click();
  await expect(host.getByTestId("connection")).toBeVisible();
  await expect(guest.getByTestId("connection")).toBeVisible();

  await expect(host.getByTestId("mp-rematch")).toBeVisible({ timeout: 90_000 });
  await host.getByTestId("mp-rematch").click();
  await guest.getByTestId("mp-accept").click();
  await expect(host.getByTestId("connection")).toBeVisible();

  await host.getByTestId("leave-match").click();
  await host.getByTestId("mp-confirm-leave").click();
  await expect(guest.getByRole("heading", { name: /left the game/ })).toBeVisible();

  await hostCtx.close();
  await guestCtx.close();
});

test("after a friend leaves a finished match, both can start a new one", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const code = await hostRoom(host);
  await joinByCode(guest, code);
  await host.getByTestId("mp-start").click();
  await expect(guest.getByTestId("mp-result-leave")).toBeVisible({ timeout: 90_000 });
  await guest.getByTestId("mp-result-leave").click();
  await expect(host.getByRole("heading", { name: /left the game/ })).toBeVisible();
  await host.getByTestId("mp-primary").click();

  // Same pages, no reload: the old room must not leak into the new one.
  await host.getByTestId("play-friend").click();
  await host.getByTestId("host-game").click();
  await expect(host.getByTestId("room-code")).toBeVisible();
  const next = (await host.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  expect(next).not.toBe(code);
  await guest.getByTestId("play-friend").click();
  await guest.getByTestId("join-code").click();
  for (let i = 0; i < 4; i++) await guest.getByTestId(`code-${i}`).fill(next[i]);
  await expect(guest.getByTestId("guest-wait")).toBeVisible();
  await expect(host.getByTestId("peer-joined")).toBeVisible();
  await host.getByTestId("mp-start").click();
  await expect(host.getByTestId("connection")).toBeVisible();
  await expect(guest.getByTestId("connection")).toBeVisible();
  await host.waitForTimeout(1500);
  await expect(host.getByRole("heading", { name: /ended the game/ })).toHaveCount(0);
  await expect(guest.getByRole("heading", { name: /ended the game/ })).toHaveCount(0);

  await hostCtx.close();
  await guestCtx.close();
});

test("chat sends an emote, and the Leave dialog pauses both players", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const code = await hostRoom(host);
  await joinByCode(guest, code);
  await host.getByTestId("mp-start").click();
  await expect(host.getByTestId("connection")).toBeVisible();
  await expect(guest.getByTestId("connection")).toBeVisible();

  await expect(host.getByTestId("emote-0")).toBeHidden();
  await host.getByTestId("chat-toggle").click();
  await expect(host.getByTestId("emote-0")).toBeVisible();
  await host.getByTestId("emote-0").click();
  await expect(host.getByTestId("emote-0")).toBeHidden();

  const clock = (page: Page) => page.evaluate(() => (window as unknown as { __tt: { game: { now: number } } }).__tt.game.now);
  await host.getByTestId("leave-match").click();
  await expect(host.getByTestId("mp-stay")).toBeVisible();
  await host.waitForTimeout(500);
  const [h1, g1] = [await clock(host), await clock(guest)];
  await host.waitForTimeout(1000);
  expect(await clock(host)).toBe(h1);
  expect(await clock(guest)).toBe(g1);
  await host.getByTestId("mp-stay").click();
  await host.waitForTimeout(1000);
  expect(await clock(host)).toBeGreaterThan(h1);
  expect(await clock(guest)).toBeGreaterThan(g1);

  await hostCtx.close();
  await guestCtx.close();
});

test("a guest can join from the invite link", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const code = await hostRoom(host);
  await guest.goto(`/?room=${code}&drive=miss`);
  await guest.getByTestId("mp-join-game").click();
  await expect(guest.getByTestId("guest-wait")).toBeVisible();
  await expect(host.getByTestId("peer-joined")).toBeVisible();

  await hostCtx.close();
  await guestCtx.close();
});

test("vs Bot: chat is there, and the power bar sets and clears the power", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Doodle Rally" })).toBeVisible();
  await page.getByTestId("play-bot").click();
  await page.locator('.option[data-mode="easy"]').click();

  const chat = page.getByTestId("chat-toggle");
  await expect(chat).toBeVisible({ timeout: 5_000 });
  await chat.click();
  await page.getByTestId("emote-0").click();
  await expect(page.getByTestId("emote-0")).toBeHidden();

  const power = page.getByTestId("power");
  const track = await power.locator(".power-track").boundingBox();
  if (!track) throw new Error("no power track");
  const y = track.y + track.height / 2;
  await page.mouse.click(track.x + track.width * 0.7, y);
  await expect(power).toHaveAttribute("aria-valuenow", /^(69|70|71)$/);
  await page.mouse.click(track.x + 2, y);
  await expect(power).toHaveAttribute("aria-valuenow", "0");
});
