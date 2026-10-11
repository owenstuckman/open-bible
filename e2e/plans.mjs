import { chromium } from "playwright-core";
import { sealData } from "iron-session";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? "e2e/.shots";
const exe = process.env.CHROME_PATH; // optional: a specific Chrome/Chromium binary
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓", m); };
const cookie = await sealData({ owner: true, passkeyId: process.env.PKID, issuedAt: Date.now() }, { password: process.env.SESSION_SECRET, ttl: 86400 });
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const api = page.request;
const local = (offsetDays = 0) => page.evaluate((o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }, offsetDays);

// clean slate
for (const k of ["bible-year", "nt-90", "gospels-30", "psalms-30", "proverbs-31"]) await api.delete(`${BASE}/api/plans/${k}`);
for (let c = 1; c <= 5; c++) await api.post(`${BASE}/api/progress/chapter`, { data: { book: "PRO", chapter: c, read: false } });

await page.goto(BASE + "/plans");
await page.getByRole("button", { name: /^Start / }).first().waitFor();
ok(await page.getByRole("button", { name: /^Start / }).count() === 5, "five plans to choose from");
await page.getByRole("button", { name: "Start Proverbs in a month" }).click();
const card = page.getByRole("region", { name: "Proverbs in a month" });
await card.waitFor();
ok((await card.innerText()).includes("Day 1 of 31"), "started today: Day 1 of 31");
ok((await card.getByRole("list", { name: "Today's chapters" }).innerText()).trim() === "Prv 1", "today's reading is Proverbs 1");

// read today's chapter elsewhere → counts
await api.post(`${BASE}/api/progress/chapter`, { data: { book: "PRO", chapter: 1, read: true } });
await page.reload();
await card.waitFor();
ok((await card.getByRole("link", { name: /Prv 1/ }).innerText()).startsWith("✓"), "finishing the chapter ticks it off in the plan");

// pretend we started 3 days ago → behind
await api.post(`${BASE}/api/plans`, { data: { key: "proverbs-31", start: await local(-3) } });
await page.reload();
await card.waitFor();
const txt = await card.innerText();
ok(txt.includes("Day 4 of 31") && txt.includes("2 chapters behind") && txt.includes("Continue with Prv 2"), "3 days in with 1 read: day 4, 2 behind, continue with Prv 2");
ok((await card.getByRole("list", { name: "Today's chapters" }).innerText()).trim() === "Prv 4", "today is Proverbs 4");
await card.getByRole("link", { name: "Continue with Prv 2 →" }).click();
await page.waitForURL((u) => u.pathname === "/read/PRO/2");
ok(true, "Continue opens the next unread chapter");

// two plans at once
await page.goto(BASE + "/plans");
await page.getByRole("button", { name: "Start Psalms in 30 days" }).click();
await page.getByRole("region", { name: "Psalms in 30 days" }).waitFor();
ok((await page.getByRole("region", { name: "Psalms in 30 days" }).getByRole("list", { name: "Today's chapters" }).innerText()).replace(/\s+/g, " ").trim() === "Ps 1 Ps 2 Ps 3 Ps 4 Ps 5", "Psalms plan: five psalms today, alongside Proverbs");
await page.screenshot({ path: SHOTS + "/plans.png", fullPage: true });

// stop
await card.getByRole("button", { name: "Stop…" }).click();
await card.getByRole("button", { name: "Stop plan" }).click();
await page.getByRole("button", { name: "Start Proverbs in a month" }).waitFor();
ok(await page.getByRole("region", { name: "Proverbs in a month" }).count() === 0, "stopping removes the plan");
ok((await (await api.get(`${BASE}/api/progress/summary`)).json()).completed.PRO?.includes(1), "chapters read stay read after stopping");

// validation / auth
ok((await api.post(`${BASE}/api/plans`, { data: { key: "nope", start: await local() } })).status() === 400, "unknown plan rejected");
ok((await api.post(`${BASE}/api/plans`, { data: { key: "nt-90", start: "yesterday" } })).status() === 400, "bad date rejected");
const anon = await browser.newContext();
ok((await anon.request.get(`${BASE}/api/plans`)).status() === 401, "plans API requires sign-in");

// progress page link + mobile
await page.goto(BASE + "/progress");
await page.getByRole("link", { name: "Reading plans" }).click();
await page.waitForURL((u) => u.pathname === "/plans");
ok(true, "progress page links to plans");
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const mp = await m.newPage();
await mp.goto(BASE + "/plans");
await mp.getByRole("region", { name: "Psalms in 30 days" }).waitFor();
ok((await mp.evaluate(() => document.documentElement.scrollWidth)) === 390, "plans page fits on a phone");
await mp.screenshot({ path: SHOTS + "/plans-mobile.png", fullPage: true });
await api.delete(`${BASE}/api/plans/psalms-30`);

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
