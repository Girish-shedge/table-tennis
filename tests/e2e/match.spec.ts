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
