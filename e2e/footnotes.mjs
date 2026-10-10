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

const chapter = await (await api.get(`${BASE}/api/chapters/GEN/1`)).json();
ok(chapter.footnotes.length > 0, `chapter API includes footnotes (${chapter.footnotes.length} in Gn 1)`);

await page.goto(BASE + "/read/GEN/1");
const ch = page.locator('main [data-chapter="GEN.1"]');
await ch.locator('[data-verse="6"]').waitFor();
ok(await ch.locator(".fn-marker").count() === chapter.footnotes.length, "every footnote has a marker in the text");

// marker sits right after the annotated phrase, and isn't part of the text
const v6 = await ch.locator('[data-verse="6"] [data-vt]').evaluate((vt) => {
  const m = vt.querySelector(".fn-marker");
  const r = document.createRange(); r.setStart(vt, 0); r.setEndBefore(m);
  return { before: r.toString(), text: vt.textContent };
});
ok(v6.before.toLowerCase().endsWith("a firmament"), `marker follows its phrase ("…${v6.before.slice(-20)}")`);
ok(!/[a-z]$/.test(v6.text) || v6.text.endsWith("waters."), "marker letter is not in the verse text");

// popover
await ch.locator('[data-verse="6"] .fn-marker').click();
const pop = page.getByRole("dialog", { name: "Footnote a" });
await pop.waitFor();
ok(await pop.getByText("A firmament", { exact: true }).count() === 1 && (await pop.innerText()).includes("whole space between the earth"), "clicking a marker opens its note");
await page.screenshot({ path: SHOTS + "/fn-popover.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
ok(await pop.count() === 0, "Escape closes it");

// chapter list
const details = ch.locator("details");
await details.locator("summary").click();
ok(await details.locator("li").count() === chapter.footnotes.length, "chapter footnote list has every note");

// highlight across a marker keeps exact offsets
for (const h of await (await api.get(`${BASE}/api/highlights?book=GEN&chapter=1`)).json()) await api.delete(`${BASE}/api/highlights/${h.id}`);
await details.locator("summary").click(); // collapse again
await ch.locator('[data-verse="6"]').scrollIntoViewIfNeeded();
await page.evaluate(() => {
  const vt = document.querySelector('main [data-chapter="GEN.1"] [data-verse="6"] [data-vt]');
  const full = vt.textContent; const start = full.indexOf("Let there be"); const end = full.indexOf("waters") + "waters".length;
  const pos = (off) => { const w = document.createTreeWalker(vt, NodeFilter.SHOW_TEXT); let acc = 0, n; while ((n = w.nextNode())) { if (off <= acc + n.length) return [n, off - acc]; acc += n.length; } };
  const r = document.createRange(); r.setStart(...pos(start)); r.setEnd(...pos(end));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
});
const toolbar = page.getByRole("toolbar", { name: "Highlight and note" });
await toolbar.waitFor();
await toolbar.getByLabel("Highlight yellow").click();
await page.waitForTimeout(600);
const hl = (await (await api.get(`${BASE}/api/highlights?book=GEN&chapter=1`)).json())[0];
const verseText = chapter.verses.find((v) => v.n === 6).text;
ok(verseText.slice(hl.startOffset, hl.endOffset).startsWith("Let there be") && verseText.slice(hl.startOffset, hl.endOffset).endsWith("waters"), `highlight across a marker saves text offsets ("${verseText.slice(hl.startOffset, hl.endOffset)}")`);
ok(await ch.locator('[data-verse="6"] .fn-marker').count() === 1, "marker still renders inside the highlight");
await api.delete(`${BASE}/api/highlights/${hl.id}`);

// settings toggle
await page.goto(BASE + "/settings");
const toggle = page.getByLabel(/Show footnotes/);
await toggle.waitFor();
ok(await toggle.isChecked(), "footnotes are on by default");
await toggle.uncheck();
await page.goto(BASE + "/read/GEN/1");
await ch.locator('[data-verse="6"]').waitFor();
ok(await ch.locator(".fn-marker").count() === 0 && await ch.locator("details").count() === 0, "turning footnotes off hides markers and the list");
await page.evaluate(() => localStorage.removeItem("ob:footnotes"));

// mobile popover fits
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await m.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const mp = await m.newPage();
await mp.goto(BASE + "/read/MAT/5");
await mp.locator('main [data-chapter="MAT.5"] .fn-marker').first().waitFor();
await mp.locator('main [data-chapter="MAT.5"] .fn-marker').first().tap();
const mpop = mp.getByRole("dialog", { name: /Footnote/ });
await mpop.waitFor();
const b = await mpop.boundingBox();
ok(b.x >= 0 && b.x + b.width <= 390, "footnote popover fits on a phone");
await mp.screenshot({ path: SHOTS + "/fn-mobile.png" });

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
