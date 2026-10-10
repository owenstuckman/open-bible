import { chromium } from "playwright-core";
import { sealData } from "iron-session";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? "e2e/.shots";
const exe = process.env.CHROME_PATH; // optional: a specific Chrome/Chromium binary
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓", m); };
const cookie = await sealData({ owner: true, passkeyId: process.env.PKID, issuedAt: Date.now() }, { password: process.env.SESSION_SECRET, ttl: 86400 });
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const sections = () => page.evaluate(() => [...document.querySelectorAll("main [data-chapter]")].map((s) => s.dataset.chapter).join(","));
const topOf = (sel) => page.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top), sel);
const modeBtn = (m) => page.getByRole("group", { name: "Reading mode" }).getByRole("button", { name: m });

await page.goto(BASE + "/read/JHN/3");
await page.locator('main [data-chapter="JHN.3"] [data-verse="16"]').waitFor();
ok((await modeBtn("Scroll").getAttribute("aria-pressed")) === "true", "scroll mode is the default");
await page.evaluate(() => document.getElementById("v-JHN-3-16").scrollIntoView({ block: "start" }));
await page.waitForTimeout(1500); // let neighbours stream in
ok((await sections()).split(",").length > 1, "scroll mode has streamed neighbouring chapters (" + await sections() + ")");

// switch to page mode keeps the verse
await modeBtn("Page").click();
await page.waitForTimeout(300);
ok((await sections()) === "JHN.3", "page mode shows just the current chapter");
const t16 = await topOf("#v-JHN-3-16");
ok(t16 > 50 && t16 < 140, "and John 3:16 is still at the top (" + t16 + "px)");
await page.screenshot({ path: SHOTS + "/p5-page.png" });

// pager + keys
await page.getByRole("button", { name: "Next chapter, Jn 4" }).click();
await page.waitForFunction(() => document.querySelector('main [data-chapter="JHN.4"]'));
ok((await sections()) === "JHN.4" && new URL(page.url()).pathname === "/read/JHN/4", "Next → John 4 (URL follows)");
ok(await page.evaluate(() => scrollY) === 0, "new page starts at the top");
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => document.querySelector('main [data-chapter="JHN.5"]'));
ok(true, "→ key turns to John 5");
await page.keyboard.press("ArrowLeft");
await page.waitForFunction(() => document.querySelector('main [data-chapter="JHN.4"]'));
ok(true, "← key turns back to John 4");

// arrow keys don't turn pages while typing in a note
await page.locator('main [data-chapter="JHN.4"] [data-verse="1"] sup').click();
await page.locator("main aside textarea").waitFor();
await page.keyboard.type("x");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(400);
ok((await sections()) === "JHN.4", "arrow keys inside a note don't turn the page");
await page.keyboard.press("Backspace"); await page.keyboard.press("Escape");

// persisted + no streaming
await page.reload();
await page.locator('main [data-chapter="JHN.4"] [data-verse="1"]').waitFor();
await page.waitForTimeout(300);
ok((await modeBtn("Page").getAttribute("aria-pressed")) === "true", "page mode is remembered after reload");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2000);
ok((await sections()) === "JHN.4", "page mode doesn't stream more chapters at the bottom");
ok(await page.getByText("4 of 21", { exact: true }).count() === 1, "pager shows chapter position");

// book boundary
await page.goto(BASE + "/read/JHN/21");
await page.getByRole("button", { name: "Next chapter, Acts 1" }).click();
await page.waitForFunction(() => document.querySelector('main [data-chapter="ACT.1"]'));
ok(true, "Next crosses book boundary (John 21 → Acts 1)");

// back to scroll keeps verse
await page.evaluate(() => document.getElementById("v-ACT-1-8").scrollIntoView({ block: "start" }));
await page.waitForTimeout(200);
const before = await topOf("#v-ACT-1-8");
await modeBtn("Scroll").click();
await page.waitForTimeout(300);
const after = await topOf("#v-ACT-1-8");
ok(Math.abs(after - before) < 10, `switching back to scroll keeps Acts 1:8 in place (${before} → ${after})`);
for (let i = 0; i < 20 && !(await sections()).includes("ACT.2"); i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(150); }
ok((await sections()).includes("ACT.2"), "scroll mode streams again");

// mobile: swipe + header fits
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await m.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const mp = await m.newPage();
mp.on("pageerror", (e) => errors.push(e.message));
await mp.goto(BASE + "/read/MAT/5");
await mp.locator('main [data-chapter="MAT.5"] [data-verse="1"]').waitFor();
ok((await mp.evaluate(() => document.documentElement.scrollWidth)) === 390, "mobile header fits (no overflow)");
await mp.screenshot({ path: SHOTS + "/p5-mobile-header.png" });
const hb = await mp.evaluate(() => [...document.querySelectorAll("header button, header a")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.height), e.scrollWidth <= e.clientWidth + 1]; }));
ok(hb.every(([l, r]) => l >= 0 && r <= 390) && hb.every(([, , h]) => h <= 40), "mobile header controls are on one row and on screen " + JSON.stringify(hb));
await mp.getByLabel("Switch to page mode").tap();
await mp.waitForTimeout(300);
const swipe = (dx) => mp.evaluate((dx) => {
  const el = document.querySelector("main [data-chapter]");
  const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
  el.dispatchEvent(new TouchEvent("touchstart", { touches: [mk(200)], changedTouches: [mk(200)], bubbles: true }));
  el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [mk(200 + dx)], bubbles: true }));
}, dx);
await swipe(-150);
await mp.waitForFunction(() => document.querySelector('main [data-chapter="MAT.6"]'));
ok(true, "swipe left → next chapter on mobile");
await swipe(150);
await mp.waitForFunction(() => document.querySelector('main [data-chapter="MAT.5"]'));
ok(true, "swipe right → previous chapter");
await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await mp.waitForTimeout(300);
await mp.screenshot({ path: SHOTS + "/p5-mobile-pager.png" });
// reset preference for other suites
await page.evaluate(() => localStorage.removeItem("ob:mode")); await mp.evaluate(() => localStorage.removeItem("ob:mode"));

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
