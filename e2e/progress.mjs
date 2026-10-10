import { chromium } from "playwright-core";
import { sealData } from "iron-session";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? "e2e/.shots";
const exe = process.env.CHROME_PATH; // optional: a specific Chrome/Chromium binary
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓", m); };
const cookie = await sealData({ owner: true, passkeyId: process.env.PKID, issuedAt: Date.now() }, { password: process.env.SESSION_SECRET, ttl: 86400 });
const browser = await chromium.launch({ executablePath: exe });
const newCtx = async (opts = {}) => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts }); await c.addCookies([{ name: "ob_session", value: cookie, url: BASE }]); return c; };
const ctx = await newCtx();
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const api = page.request;
const summary = async () => (await api.get(`${BASE}/api/progress/summary`)).json();
for (const [book, chapter] of [["PHM", 1], ["JUD", 1], ["GEN", 1]]) await api.post(`${BASE}/api/progress/chapter`, { data: { book, chapter, read: false } });

// 1. read Philemon slowly → auto-complete
await page.goto(BASE + "/read/PHM/1");
await page.locator('main [data-chapter="PHM.1"] [data-verse="1"]').waitFor();
const badge = page.locator('main [data-chapter="PHM.1"] h2 button');
ok((await badge.innerText()) === "Mark read", "unread chapter shows 'Mark read'");
const lastVerse = page.locator('main [data-chapter="PHM.1"] [data-verse="25"]');
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1700);
  const done = await lastVerse.evaluate((el) => el.getBoundingClientRect().bottom < innerHeight - 40);
  if (done) break;
  await page.mouse.wheel(0, 500);
}
await page.waitForTimeout(1800);
await page.waitForFunction(() => document.querySelector('main [data-chapter="PHM.1"] h2 button')?.textContent === "✓ Read", null, { timeout: 15000 });
ok(true, "reading through Philemon marks it ✓ Read automatically (after a 5s flush)");
let s = await summary();
ok(s.completed.PHM?.includes(1), "server records Philemon 1 as complete");
ok(s.totals.completed >= 1 && s.totals.chapters === 1334, `totals: ${s.totals.completed}/${s.totals.chapters}`);

// 2. fast scroll does not count
await page.goto(BASE + "/read/GEN/1");
await page.locator('main [data-chapter="GEN.1"] [data-verse="1"]').waitFor();
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
await page.waitForTimeout(6500);
s = await summary();
ok(!s.completed.GEN?.includes(1), "skimming Genesis 1 quickly does not complete it");

// 3. manual mark / unmark
await page.goto(BASE + "/read/JUD/1");
const jb = page.locator('main [data-chapter="JUD.1"] h2 button');
await jb.waitFor();
await jb.click();
await page.waitForFunction(() => document.querySelector('main [data-chapter="JUD.1"] h2 button')?.textContent === "✓ Read");
await page.waitForTimeout(400);
ok((await summary()).completed.JUD?.includes(1), "Mark read → saved");
await jb.click();
await page.waitForTimeout(400);
ok(!(await summary()).completed.JUD?.includes(1) && (await jb.innerText()) === "Mark read", "click again → unread");

// 4. resume across devices (position flush)
await page.goto(BASE + "/read/MRK/4");
await page.locator('main [data-chapter="MRK.4"] [data-verse="10"]').waitFor();
await page.evaluate(() => document.querySelector('main [data-chapter="MRK.4"] [data-verse="10"]').scrollIntoView({ block: "start" }));
await page.waitForTimeout(6500);
const topVerse = "10";
const other = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const op = await other.newPage();
await op.goto(BASE + "/");
await op.waitForURL((u) => u.pathname === "/read/MRK/4", { timeout: 15000 });
ok(new URL(op.url()).hash === `#v-MRK-4-${topVerse}`, `"/" on another device resumes at Mk 4:${topVerse} (${new URL(op.url()).hash})`);
await op.waitForTimeout(800);
const vis = await op.evaluate((v) => { const r = document.getElementById(`v-MRK-4-${v}`).getBoundingClientRect(); return r.top > 0 && r.top < 250; }, topVerse);
ok(vis, "and that verse is at the top of the screen");
await op.waitForTimeout(6500); // let the other device flush its position
await op.goto(BASE + "/");
await op.waitForURL((u) => u.pathname === "/read/MRK/4");
ok(new URL(op.url()).hash === "#v-MRK-4-10", "resuming again does not drift (" + new URL(op.url()).hash + ")");

// 5. beacon on leaving the page
await page.goto(BASE + "/read/LUK/2");
await page.locator('main [data-chapter="LUK.2"] [data-verse="20"]').waitFor();
await page.evaluate(() => document.querySelector('main [data-chapter="LUK.2"] [data-verse="20"]').scrollIntoView({ block: "start" }));
await page.waitForTimeout(500);
await page.goto("about:blank"); // pagehide → sendBeacon
await page.waitForTimeout(800);
s = await summary();
ok(s.position.book === "LUK" && s.position.chapter === 2 && s.position.verse === 20, `position saved on page hide (Lk 2:${s.position.verse})`);

// 6. progress page
await page.goto(BASE + "/progress");
await page.getByRole("heading", { name: "Reading progress" }).waitFor();
await page.getByText("chapters read", { exact: true }).waitFor();
const phm = page.getByRole("link", { name: "Philemon 1, read" });
ok(await phm.count() === 1, "progress page marks Philemon 1 as read");
ok(await page.getByRole("link", { name: /Continue: Lk 2:/ }).count() === 1, "Continue button points to the saved position");
await page.screenshot({ path: SHOTS + "/p4-progress.png", fullPage: false });
await page.getByRole("link", { name: /Continue: Lk 2:/ }).click();
await page.waitForURL((u) => u.pathname === "/read/LUK/2");
ok(true, "Continue opens the reader there");

// header bar
await page.locator("header").getByRole("link", { name: /Reading progress/ }).waitFor();
ok(true, "reader header links to progress");
await page.screenshot({ path: SHOTS + "/p4-reader.png" });
const mp = await other.newPage();
await mp.goto(BASE + "/progress");
await mp.getByText("chapters read", { exact: true }).waitFor();
ok((await mp.evaluate(() => document.documentElement.scrollWidth)) === 390, "progress page fits on mobile");
await mp.screenshot({ path: SHOTS + "/p4-progress-mobile.png" });

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
