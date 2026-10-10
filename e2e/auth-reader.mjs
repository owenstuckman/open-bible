import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const TOKEN = process.env.TOKEN;
const SHOTS = process.env.SHOTS ?? "e2e/.shots";
const exe = process.env.CHROME_PATH; // optional: a specific Chrome/Chromium binary
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓", m); };

process.on("uncaughtException", async (e) => { console.log("ERR", e.message.split("\n")[0]); try { const pages = browser.contexts().flatMap((c) => c.pages()); for (const [i, p] of pages.entries()) { console.log("page", i, p.url()); await p.screenshot({ path: `${SHOTS}/fail-${i}.png` }); } } catch {} process.exit(1); });
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();

// Unauthenticated
await page.goto(BASE + "/read/JHN/1");
ok(page.url().startsWith(BASE + "/login?next=%2Fread%2FJHN%2F1"), "unauthenticated page redirects to /login with next");
await page.screenshot({ path: SHOTS + "/login.png" });
let r = await page.request.get(BASE + "/api/chapters/JHN/1");
ok(r.status() === 401, "chapter API is 401 without session");
r = await page.request.post(BASE + "/api/auth/register/options", { data: { nickname: "x", token: "wrong-token-123456789" } });
ok(r.status() === 403, "register options refused with bad token");
let resp = await page.goto(BASE + "/setup?token=wrong-token-123456789");
ok((await page.content()).includes("404") || resp.status() === 404, "setup with wrong token shows 404");

// Virtual authenticator
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
  protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true,
  isUserVerified: true, automaticPresenceSimulation: true } });

// Setup
await page.goto(BASE + "/setup?token=" + TOKEN);
await page.getByPlaceholder("e.g. iPhone, Work laptop").fill("Test laptop");
await page.screenshot({ path: SHOTS + "/setup.png" });
await page.getByRole("button", { name: "Create passkey" }).click();
await page.waitForURL((u) => u.pathname.startsWith("/read/"), { timeout: 20000 });
ok(true, "setup enrolls passkey and lands in the reader (" + new URL(page.url()).pathname + ")");
await page.goto(BASE + "/read/GEN/1");
ok(await page.getByText("In the beginning God created heaven, and earth.").first().waitFor().then(() => true), "Genesis 1:1 renders");

resp = await page.goto(BASE + "/setup?token=" + TOKEN);
ok((await page.content()).includes("could not be found") || (await page.content()).includes("404"), "setup page closed after first enrollment");
r = await page.request.post(BASE + "/api/auth/register/options", { data: { nickname: "x", token: TOKEN } });
ok(r.status() === 200, "signed-in owner may request registration options (add device)");

// Reader + continuous scroll
await page.goto(BASE + "/read/JHN/1");
ok(await page.getByText("In the beginning was the Word: and the Word was with God").first().waitFor().then(() => true), "John 1:1 renders");
await page.screenshot({ path: SHOTS + "/reader.png" });
for (let i = 0; i < 30 && !(await page.locator('[data-chapter="JHN.2"]').count()); i++) {
  await page.mouse.wheel(0, 1500); await page.waitForTimeout(150);
}
ok(await page.locator('[data-chapter="JHN.2"]').count() === 1, "scrolling down streams in John 2");
await page.locator('[data-chapter="JHN.2"]').scrollIntoViewIfNeeded();
await page.evaluate(() => document.querySelector('[data-chapter="JHN.2"]').scrollIntoView());
await page.waitForTimeout(400);
ok(page.url().endsWith("/read/JHN/2"), "URL follows the chapter in view (" + page.url() + ")");
ok((await page.locator("header button").first().innerText()).includes("John 2"), "header shows John 2");

// Scroll up from John 1: Luke 24 prepends above without moving the text in view
await page.goto(BASE + "/read/JHN/1");
await page.getByText("In the beginning was the Word").first().waitFor();
const before = await page.evaluate(() => document.querySelector('[data-chapter="JHN.1"]').getBoundingClientRect().top);
await page.mouse.wheel(0, 600);
await page.waitForSelector('[data-chapter="LUK.24"]', { timeout: 10000 });
await page.waitForTimeout(500);
const after = await page.evaluate(() => document.querySelector('[data-chapter="JHN.1"]').getBoundingClientRect().top);
ok(Math.abs((before - 600) - after) < 60, `prepending Luke 24 keeps John 1 in place (moved ${Math.round(before - after)}px for a 600px scroll)`);

// Book picker
await page.goto(BASE + "/read/JHN/3");
await page.locator("header button").first().click();
await page.getByPlaceholder(/Filter books/).fill("sir");
await page.screenshot({ path: SHOTS + "/picker-filter.png" });
await page.keyboard.press("Enter");
await page.screenshot({ path: SHOTS + "/picker.png" });
await page.getByRole("dialog").getByRole("button", { name: "3", exact: true }).click();
await page.waitForURL(/\/read\/SIR\/3$/);
ok(await page.locator('[data-chapter="SIR.3"]').count() === 1, "book picker navigates to Sirach 3");

// Lowercase/canonical redirect + 404
await page.goto(BASE + "/read/jhn/1");
await page.waitForURL(/\/read\/JHN\/1$/);
ok(true, "lowercase book code redirects to canonical URL");
resp = await page.goto(BASE + "/read/JHN/99");
ok((await page.content()).includes("could not be found") || resp.status() === 404, "nonexistent chapter 404s");

// Home resumes last chapter
await page.goto(BASE + "/read/MRK/4");
await page.locator('[data-chapter="MRK.4"] [data-verse="1"]').waitFor();
await page.waitForTimeout(6000); // position flush
await page.goto(BASE + "/");
await page.waitForURL((u) => u.pathname === "/read/MRK/4");
ok(true, "home resumes last-read chapter");

// Settings + sign out + sign in
await page.goto(BASE + "/settings");
ok(await page.getByText("Test laptop").first().waitFor().then(() => true), "settings lists the passkey");
ok(await page.getByText("Only passkey").first().waitFor().then(() => true), "only passkey can't be removed");
r = await page.request.delete(BASE + "/api/passkeys/whatever");
ok(r.status() === 400, "API refuses deleting the last passkey");
await page.screenshot({ path: SHOTS + "/settings.png", fullPage: true });
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForURL(/\/login/);
r = await page.request.get(BASE + "/api/chapters/JHN/1");
ok(r.status() === 401, "signed out: API 401");
await page.goto(BASE + "/login?next=/read/PSA/23");
await page.getByRole("button", { name: /Sign in with passkey/ }).click();
await page.waitForURL((u) => u.pathname === "/read/PSA/23", { timeout: 20000 });
ok(true, "passkey sign-in returns to ?next target");

// open-redirect guard
await page.goto(BASE + "/settings"); await page.screenshot({ path: SHOTS + "/dbg-settings2.png" }); console.log("url", page.url()); await page.getByRole("button", { name: "Sign out" }).click(); await page.waitForURL(/\/login/);
await page.goto(BASE + "/login?next=//evil.example.com");
await page.getByRole("button", { name: /Sign in with passkey/ }).click();
await page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/login"), { timeout: 20000 });
ok(new URL(page.url()).origin === BASE, "next=//evil is ignored");

// Mobile screenshot
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
const mp = await m.newPage();
await mp.goto(BASE + "/read/PSA/22");
await mp.screenshot({ path: SHOTS + "/mobile.png" });
const dark = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "dark", storageState: await ctx.storageState() });
const dp = await dark.newPage();
await dp.goto(BASE + "/read/MAT/5");
await dp.screenshot({ path: SHOTS + "/dark.png" });
await browser.close();
console.log("ALL PASSED");
