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
const api = page.request;
const list = async () => (await api.get(`${BASE}/api/highlights?book=JHN&chapter=1`)).json();
for (const h of await list()) await api.delete(`${BASE}/api/highlights/${h.id}`);

// select helper: text within a verse's text span, by substring (nth occurrence 0)
const select = (v1, s1, v2, s2, end2) => page.evaluate(([v1, s1, v2, s2, end2]) => {
  const node = (v, needle) => {
    const vt = document.querySelector(`main [data-chapter="JHN.1"] [data-verse="${v}"] [data-vt]`);
    const walker = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT);
    let off = 0, n; const full = vt.textContent; const at = full.indexOf(needle);
    while ((n = walker.nextNode())) { if (at < off + n.length) return [n, at - off]; off += n.length; }
  };
  const [a, ao] = node(v1, s1); const [b, bo] = node(v2, s2);
  const r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo + (end2 ? s2.length : 0));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}, [v1, s1, v2, s2, end2]);

await page.goto(BASE + "/read/JHN/1");
await page.locator('main [data-chapter="JHN.1"] [data-verse="1"]').waitFor();
await page.waitForTimeout(500);

// 1. single-verse highlight
await select(1, "the Word", 1, "the Word", true);
const toolbar = page.getByRole("toolbar", { name: "Highlight and note" });
await toolbar.waitFor();
ok(true, "selecting text shows the highlight toolbar");
await page.screenshot({ path: SHOTS + "/p3-toolbar.png" });
await toolbar.getByLabel("Highlight yellow").click();
const mark1 = page.locator('main [data-chapter="JHN.1"] [data-verse="1"] mark.hl-yellow');
await mark1.waitFor();
ok((await mark1.innerText()) === "the Word", "yellow mark wraps exactly the selection");
await page.waitForTimeout(500);
let hs = await list();
ok(hs.length === 1 && hs[0].verseStart === 1 && hs[0].startOffset === 21 && hs[0].endOffset === 29 && hs[0].color === "yellow" && hs[0].translation === "dra", "saved with correct offsets " + JSON.stringify(hs[0] && [hs[0].startOffset, hs[0].endOffset]));
ok(await toolbar.count() === 0, "toolbar closes after choosing a color");

// 2. multi-verse highlight
await select(4, "the life", 5, "darkness", true);
await toolbar.waitFor();
await toolbar.getByLabel("Highlight blue").click();
await page.locator('main [data-chapter="JHN.1"] [data-verse="5"] mark.hl-blue').waitFor();
ok((await page.locator('main [data-chapter="JHN.1"] [data-verse="4"] mark.hl-blue').innerText()) === "the life was the light of men.", "multi-verse: tail of v4 highlighted");
ok((await page.locator('main [data-chapter="JHN.1"] [data-verse="5"] mark.hl-blue').innerText()) === "And the light shineth in darkness", "multi-verse: head of v5 highlighted");

// 3. whole verse incl. verse number boundary
await page.evaluate(() => { const p = document.querySelector('main [data-chapter="JHN.1"] [data-verse="2"]'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await toolbar.waitFor();
await toolbar.getByLabel("Highlight pink").click();
await page.locator('main [data-chapter="JHN.1"] [data-verse="2"] mark.hl-pink').waitFor();
ok((await page.locator('main [data-chapter="JHN.1"] [data-verse="2"] mark.hl-pink').innerText()) === "The same was in the beginning with God.", "selecting a whole verse (incl. its number) highlights just the text");
await page.waitForTimeout(500);

// 4. persistence
await page.reload();
await mark1.waitFor();
ok(await page.locator('main [data-chapter="JHN.1"] mark.hl').count() === 4, "highlights reload from the server (4 marks)");
await page.screenshot({ path: SHOTS + "/p3-desktop.png" });

// 5. click → recolor
await mark1.click();
await toolbar.waitFor();
ok((await toolbar.getByLabel("Highlight yellow").getAttribute("aria-pressed")) === "true", "clicking a highlight shows its current color");
ok(await toolbar.getByRole("button", { name: "Remove" }).count() === 1, "and offers Remove");
await toolbar.getByLabel("Highlight green").click();
await page.locator('main [data-chapter="JHN.1"] [data-verse="1"] mark.hl-green').waitFor();
await page.waitForTimeout(400);
ok((await list()).find((h) => h.verseStart === 1).color === "green", "recolor saved");

// 6. Escape dismisses
await page.locator('main [data-chapter="JHN.1"] [data-verse="1"] mark.hl-green').click();
await toolbar.waitFor(); await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok(await toolbar.count() === 0, "Escape dismisses the toolbar");

// 7. note from highlight
await page.locator('main [data-chapter="JHN.1"] [data-verse="2"] mark.hl-pink').click();
await toolbar.getByRole("button", { name: "✎ Note" }).click();
const aside = page.locator('main [data-chapter="JHN.1"] aside');
await aside.locator("textarea").waitFor();
ok(await aside.getByText("“The same was in the beginning with God.”").count() === 1, "Note from a highlight carries its text as the quote");
await page.keyboard.type("Pre-existence of the Word.");
await aside.getByText("✓ Saved").waitFor({ timeout: 5000 });
await page.keyboard.press("Escape");

// 8. remove
await page.locator('main [data-chapter="JHN.1"] [data-verse="2"] mark.hl-pink').click();
await toolbar.getByRole("button", { name: "Remove" }).click();
await page.waitForTimeout(500);
ok(await page.locator('main [data-chapter="JHN.1"] [data-verse="2"] mark').count() === 0, "Remove clears the highlight");
ok((await list()).length === 2, "and deletes it on the server");

// 9. API validation & auth
ok((await api.post(`${BASE}/api/highlights`, { data: { bookId: "JHN", chapter: 1, verseStart: 1, startOffset: 5, verseEnd: 1, endOffset: 5, color: "yellow" } })).status() === 400, "empty range rejected");
ok((await api.post(`${BASE}/api/highlights`, { data: { bookId: "JHN", chapter: 1, verseStart: 1, startOffset: 0, verseEnd: 1, endOffset: 5, color: "red" } })).status() === 400, "unknown color rejected");
const anon = await browser.newContext();
ok((await anon.request.get(`${BASE}/api/highlights?book=JHN&chapter=1`)).status() === 401, "highlights API 401 without session");

// 10. mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await m.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const mp = await m.newPage();
mp.on("pageerror", (e) => errors.push(e.message));
await mp.goto(BASE + "/read/JHN/1");
await mp.locator('main [data-chapter="JHN.1"] [data-verse="6"]').waitFor();
await mp.waitForTimeout(400);
await mp.evaluate(() => { const vt = document.querySelector('main [data-chapter="JHN.1"] [data-verse="6"] [data-vt]'); const t = vt.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 23); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
const mt = mp.getByRole("toolbar", { name: "Highlight and note" });
await mt.waitFor();
const tb = await mt.boundingBox();
ok(tb.x >= 0 && tb.x + tb.width <= 390, "mobile toolbar fits on screen");
await mp.screenshot({ path: SHOTS + "/p3-mobile-toolbar.png" });
await mt.getByLabel("Highlight pink").tap();
await mp.locator('main [data-chapter="JHN.1"] [data-verse="6"] mark.hl-pink').waitFor();
ok(true, "tapping a color on mobile highlights");
await mp.waitForTimeout(500);
await mp.screenshot({ path: SHOTS + "/p3-mobile.png" });

const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await d.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const dp = await d.newPage(); await dp.goto(BASE + "/read/JHN/1"); await dp.locator("main mark.hl").first().waitFor(); await dp.waitForTimeout(400);
await dp.screenshot({ path: SHOTS + "/p3-dark.png" });

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
