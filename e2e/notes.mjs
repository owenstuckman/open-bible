import { chromium } from "playwright-core";
import { sealData } from "iron-session";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? "e2e/.shots";
const exe = process.env.CHROME_PATH; // optional: a specific Chrome/Chromium binary
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓", m); };
const seal = (passkeyId) => sealData({ owner: true, passkeyId, issuedAt: Date.now() }, { password: process.env.SESSION_SECRET, ttl: 86400 });
const cookie = await seal(process.env.PKID);
process.on("uncaughtException", async (e) => { console.log("ERR", e.message.split("\n")[0]); try { const pages = browser.contexts().flatMap((c) => c.pages()); for (const [i, p] of pages.entries()) { console.log("page", i, p.url()); await p.screenshot({ path: `${SHOTS}/fail-${i}.png` }); } } catch {} process.exit(1); });
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => { errors.push("dialog: " + d.message()); d.dismiss(); });

// clean slate
const api = page.request;
for (const ch of [1]) for (const n of await (await api.get(`${BASE}/api/notes?book=JHN&chapter=${ch}`)).json()) await api.delete(`${BASE}/api/notes/${n.id}`);

await page.goto(BASE + "/read/JHN/1");
await page.locator('[data-chapter="JHN.1"] [data-verse="1"]').waitFor();
const aside = page.locator('[data-chapter="JHN.1"] aside');

// 1. verse-number click → draft note, focused
await page.locator('[data-chapter="JHN.1"] [data-verse="1"] sup').click();
const ta = aside.locator("textarea");
await ta.waitFor();
ok(await ta.evaluate((el) => el === document.activeElement), "clicking verse number opens a focused note editor");
await page.keyboard.type("**Word** = *Logos*. See [[Gen 1:1]]\n- creation retold\n- ");
await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
await aside.getByText("✓ Saved").waitFor({ timeout: 5000 });
let saved = await (await api.get(`${BASE}/api/notes?book=JHN&chapter=1`)).json();
ok(saved.length === 1 && saved[0].bodyMd.startsWith("**Word**") && saved[0].verseStart === 1, "autosave persisted the note via API");
await page.keyboard.press("Escape");
await aside.locator(".note-md strong", { hasText: "Word" }).waitFor();
ok(await aside.locator(".note-md em", { hasText: "Logos" }).count() === 1, "Markdown renders bold/italic after Esc");
const link = aside.locator('.note-md a.verse-link');
ok((await link.getAttribute("href")) === "/read/GEN/1#v-GEN-1-1", "[[Gen 1:1]] becomes a verse link");
ok(await aside.locator(".note-md li").count() === 1, "list renders");

// 2. alignment
const align = async (v) => page.evaluate((v) => {
  const verse = document.querySelector(`[data-chapter="JHN.1"] [data-verse="${v}"]`).getBoundingClientRect().top;
  const slot = document.querySelector(`[data-chapter="JHN.1"] [data-note-slot="${v}"]`).getBoundingClientRect().top;
  return Math.round(slot - verse);
}, v);
await page.waitForTimeout(400);
ok(Math.abs(await align(1)) <= 2, "note card top aligns with verse 1 (" + await align(1) + "px)");

// 3. selection → note with quote on verse 9 (far enough to align freely)
await page.evaluate(() => {
  const p = document.querySelector('[data-chapter="JHN.1"] [data-verse="9"]');
  const text = [...p.querySelector("[data-vt]").childNodes].find((n) => n.nodeType === 3 && n.textContent.includes("true light"));
  const i = text.textContent.indexOf("true light");
  const r = document.createRange(); r.setStart(text, i); r.setEnd(text, i + "true light".length);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
});
const noteBtn = page.getByRole("button", { name: "✎ Note" });
await noteBtn.waitFor({ timeout: 3000 });
ok(true, "selecting text shows the ✎ Note popover");
await page.screenshot({ path: SHOTS + "/p2-selection.png" });
await noteBtn.click();
const ta2 = aside.locator("textarea");
await ta2.waitFor();
ok(await aside.getByText("“true light”").count() === 1, "selection note carries the quote");
await page.keyboard.type("The Logos as light, as in v4.");
await aside.getByText("✓ Saved").waitFor({ timeout: 5000 });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok(Math.abs(await align(9)) <= 2, "second note aligns with verse 9 (" + await align(9) + "px)");

// 4. persistence across reload
await page.reload();
await aside.locator(".note-md").first().waitFor();
ok(await aside.locator("article").count() === 2, "both notes reload from the server");
await page.screenshot({ path: SHOTS + "/p2-desktop.png" });

// 5. hover linking
await aside.locator("article").nth(1).hover();
ok(await page.locator('[data-chapter="JHN.1"] [data-verse="9"].bg-accent-soft').count() === 1, "hovering a note tints its verse");
await page.locator('[data-chapter="JHN.1"] [data-verse="1"]').hover();
ok(await aside.locator("article.border-accent").count() === 1, "hovering a verse outlines its note");

// 6. edit
await aside.locator("article").nth(1).locator('[role="button"]').click();
await page.keyboard.press("End");
await page.keyboard.type(" Edited.");
await aside.getByText("✓ Saved").waitFor({ timeout: 5000 });
await page.keyboard.press("Escape");
saved = await (await api.get(`${BASE}/api/notes?book=JHN&chapter=1`)).json();
ok(saved.find((n) => n.verseStart === 9).bodyMd.endsWith("Edited."), "editing saves the change");

// 7. empty draft is discarded
await page.locator('[data-chapter="JHN.1"] [data-verse="3"] sup').click();
await aside.locator("textarea").waitFor();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ok(await aside.locator("article").count() === 2, "an empty new note disappears on Esc");
ok((await (await api.get(`${BASE}/api/notes?book=JHN&chapter=1`)).json()).length === 2, "and was never saved");

// 8. delete
await aside.locator("article").nth(1).getByLabel("Delete note").click();
await aside.locator("article").nth(1).getByRole("button", { name: "Delete", exact: true }).click();
await page.waitForTimeout(500);
ok((await (await api.get(`${BASE}/api/notes?book=JHN&chapter=1`)).json()).length === 1, "delete removes the note on the server");

// 9. XSS
await page.locator('[data-chapter="JHN.1"] [data-verse="12"] sup').click();
await aside.locator("textarea").waitFor();
await aside.locator("textarea").fill('<script>window.__xss=1</script><img src=x onerror="window.__xss=2"> [bad](javascript:window.__xss=3) <b>html</b>');
await aside.getByText("✓ Saved").waitFor({ timeout: 5000 });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const xss = await page.evaluate(() => ({ flag: window.__xss, img: !!document.querySelector(".note-md img"), js: [...document.querySelectorAll(".note-md a")].some((a) => (a.getAttribute("href") || "").startsWith("javascript")) }));
ok(!xss.flag && !xss.img && !xss.js, "raw HTML / javascript: links are not rendered (" + JSON.stringify(xss) + ")");
for (const n of await (await api.get(`${BASE}/api/notes?book=JHN&chapter=1`)).json()) if (n.verseStart === 12) await api.delete(`${BASE}/api/notes/${n.id}`);

// 10. resize divider persists
const box = await page.locator('[role="separator"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, 400); await page.mouse.down(); await page.mouse.move(900, 400, { steps: 5 }); await page.mouse.up();
const stored = await page.evaluate(() => localStorage.getItem("ob:split"));
ok(Math.abs(Number(stored) - (900 - 24) / (1440 - 48) * 100) < 3, "dragging the divider resizes and remembers the split (" + stored + "%)");
await page.reload();
await page.locator('[data-chapter="JHN.1"] [data-verse="1"]').waitFor();
ok((await page.evaluate(() => document.querySelector('[role="separator"]').parentElement.style.getPropertyValue("--split"))) === stored + "%", "split restored after reload");
await page.evaluate(() => localStorage.removeItem("ob:split"));

// 11. verse link navigation
const st = (l) => page.evaluate((l) => l + " y=" + Math.round(scrollY) + " url=" + location.pathname + location.hash + " " + [...document.querySelectorAll("main [data-chapter]")].map(s => s.dataset.chapter + "@" + Math.round(s.getBoundingClientRect().top)).join(","), l);
console.log(await st("before link"));
await page.waitForTimeout(1500);
console.log(await st("before link +1.5s"));
await aside.locator(".note-md a.verse-link").click();
await page.waitForTimeout(1500);
console.log(await st("after link"));
await page.waitForURL((u) => u.pathname === "/read/GEN/1" && u.hash === "#v-GEN-1-1");
await page.locator("#v-GEN-1-1").waitFor();
await page.waitForTimeout(400);
const inView = await page.evaluate(() => { const r = document.getElementById("v-GEN-1-1").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
ok(inView, "[[ref]] link opens that verse in view");

// 12. API auth
const anon = await browser.newContext();
ok((await anon.request.get(`${BASE}/api/notes?book=JHN&chapter=1`)).status() === 401, "notes API 401 without session");
await anon.addCookies([{ name: "ob_session", value: await seal("revoked-passkey"), url: BASE }]);
ok((await anon.request.post(`${BASE}/api/notes`, { data: { bookId: "JHN", chapter: 1, verseStart: 1, bodyMd: "x" } })).status() === 401, "writes refused for a session whose passkey was revoked");
ok((await api.post(`${BASE}/api/notes`, { data: { bookId: "XXX", chapter: 1, verseStart: 1 } })).status() === 400, "invalid book rejected");

// 13. mobile sheet
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await m.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const mp = await m.newPage();
await mp.goto(BASE + "/read/JHN/1");
await mp.locator('[data-chapter="JHN.1"] [data-verse="1"]').waitFor();
await mp.getByLabel("Notes on verse 1").waitFor();
ok(true, "mobile shows ✎ marker on a noted verse");
ok((await mp.locator("header").getByLabel(/Notes for this chapter/).innerText()).includes("1"), "header shows the chapter's note count");
await mp.getByLabel("Notes on verse 1").tap();
const sheet = mp.getByRole("dialog", { name: "Notes" });
await mp.locator('section[aria-label="Notes"].translate-y-0').waitFor({ timeout: 3000 });
await mp.waitForTimeout(400);
ok(await sheet.locator(".note-md strong", { hasText: "Word" }).isVisible(), "tapping the marker opens the notes sheet");
await mp.screenshot({ path: SHOTS + "/p2-mobile-sheet.png" });
await sheet.getByLabel("Close notes").tap();
await mp.waitForTimeout(400);
await mp.locator('[data-chapter="JHN.1"] [data-verse="4"] sup').tap();
await sheet.locator("textarea").waitFor();
await mp.keyboard.type("Life and light.");
await sheet.getByText("✓ Saved").waitFor({ timeout: 5000 });
ok(true, "tapping a verse number on mobile opens the sheet with a new note, which saves");
const after = await (await api.get(`${BASE}/api/notes?book=JHN&chapter=1`)).json();
ok(after.some((n) => n.verseStart === 4 && n.bodyMd === "Life and light."), "mobile note persisted");
ok((await mp.evaluate(() => document.documentElement.scrollWidth)) === 390, "no horizontal overflow on mobile");

const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await d.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const dp = await d.newPage(); await dp.goto(BASE + "/read/JHN/1"); await dp.locator("aside article").first().waitFor(); await dp.waitForTimeout(300);
await dp.screenshot({ path: SHOTS + "/p2-dark.png" });

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
