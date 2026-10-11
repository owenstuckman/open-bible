import { chromium } from "playwright-core";
import { sealData } from "iron-session";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? "e2e/.shots";
const exe = process.env.CHROME_PATH; // optional: a specific Chrome/Chromium binary
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("✓", m); };
const cookie = await sealData({ owner: true, passkeyId: process.env.PKID, issuedAt: Date.now() }, { password: process.env.SESSION_SECRET, ttl: 86400 });
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.addCookies([{ name: "ob_session", value: cookie, url: BASE }]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const api = page.request;

// seed a distinctive note
for (const n of await (await api.get(`${BASE}/api/notes?book=ROM&chapter=8`)).json()) await api.delete(`${BASE}/api/notes/${n.id}`);
await api.post(`${BASE}/api/notes`, { data: { bookId: "ROM", chapter: 8, verseStart: 28, bodyMd: "Providence: **zebrafinch** all things work together", quote: "all things work together" } });

// --- search API
let r = await (await api.get(`${BASE}/api/search?q=${encodeURIComponent("loved the world")}`)).json();
ok(r.bible.total > 0 && r.bible.hits.some((h) => h.book === "JHN" && h.chapter === 3 && h.verse === 16), `"loved the world" finds John 3:16 (${r.bible.total} hits)`);
ok(r.bible.hits[0].snippet.includes(""), "snippets mark the matched words");
r = await (await api.get(`${BASE}/api/search?q=${encodeURIComponent('"so loved the world"')}&scope=NT`)).json();
ok(r.bible.hits.length >= 1 && r.bible.hits.every((h) => ["MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"].includes(h.book)), "phrase search scoped to the New Testament");
r = await (await api.get(`${BASE}/api/search?q=mercy&scope=PSA`)).json();
ok(r.bible.hits.length > 0 && r.bible.hits.every((h) => h.book === "PSA"), "book scope (Psalms)");
r = await (await api.get(`${BASE}/api/search?q=zebrafinch`)).json();
ok(r.notes.total === 1 && r.notes.hits[0].book === "ROM" && r.notes.hits[0].snippet.includes("zebrafinch"), "notes search finds the note");
r = await (await api.get(`${BASE}/api/search?q=God`)).json();
ok(r.bible.total > 1000 && r.bible.hits.length === 50, `common word: ${r.bible.total} hits, first page of 50`);
ok((await api.get(`${BASE}/api/search?q=a`)).status() === 400, "1-character query rejected");
ok((await api.get(`${BASE}/api/search?q=${encodeURIComponent("'); drop table verses; --")}`)).status() === 200, "odd input is just text");
const anon = await browser.newContext();
ok((await anon.request.get(`${BASE}/api/search?q=love`)).status() === 401, "search API requires sign-in");

// --- search UI
await page.goto(BASE + "/read/JHN/1");
await page.locator('main [data-verse="1"]').first().waitFor();
await page.keyboard.press("/");
await page.waitForURL((u) => u.pathname === "/search");
ok(true, '"/" in the reader opens search');
await page.getByRole("searchbox", { name: "Search" }).fill("light shineth in darkness");
const firstHit = page.locator("main ol li a").first();
await firstHit.waitFor();
ok((await firstHit.innerText()).includes("Jn 1:5"), "UI result: Jn 1:5 for 'light shineth in darkness'");
ok(await page.locator("main ol mark").count() > 0, "matches are highlighted");
await page.screenshot({ path: SHOTS + "/search.png" });
await page.getByRole("tab", { name: /Your notes/ }).click();
await page.getByRole("searchbox", { name: "Search" }).fill("zebrafinch");
await page.locator("main ol li a", { hasText: "Rom 8:28" }).waitFor();
ok(true, "notes tab shows the matching note");
await firstHit.click();
await page.waitForURL((u) => u.pathname === "/read/ROM/8" && u.hash === "#v-ROM-8-28");
ok(true, "clicking a result opens that verse");
await page.goto(BASE + "/search");
await page.getByRole("searchbox", { name: "Search" }).fill("1 Cor 13:4");
await page.getByRole("link", { name: /Go to 1 Cor 13:4/ }).waitFor();
await page.keyboard.press("Enter");
await page.waitForURL((u) => u.pathname === "/read/1CO/13" && u.hash === "#v-1CO-13-4");
ok(true, "typing a reference + Enter jumps to it");
await page.goto(BASE + "/search?q=charity");
await page.locator("main ol li a").first().waitFor();
ok((await page.getByRole("searchbox", { name: "Search" }).inputValue()) === "charity", "search state lives in the URL");

// --- notes page
await page.goto(BASE + "/notes");
await page.getByRole("heading", { name: "Your notes" }).waitFor();
await page.locator("#book-ROM").getByText("zebrafinch").waitFor();
ok(await page.locator("#book-ROM strong", { hasText: "zebrafinch" }).count() === 1, "notes page renders notes as Markdown, grouped by book");
await page.screenshot({ path: SHOTS + "/notes-page.png" });

// --- export
const [mdDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export Markdown" }).click()]);
const md = await (await mdDl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
ok(mdDl.suggestedFilename().startsWith("open-bible-notes-") && md.includes("## Romans") && md.includes("### Rom 8:28") && md.includes("> all things work together"), "Markdown export has the note under its book");
const backup = await (await api.get(`${BASE}/api/export?format=json`)).json();
ok(backup.app === "open-bible" && backup.version === 1 && backup.notes.some((n) => n.bodyMd.includes("zebrafinch")) && Array.isArray(backup.verseReads), "JSON backup holds notes, highlights and progress");

// --- restore: delete the note, restore, it's back (and restoring twice adds nothing)
const zebra = backup.notes.find((n) => n.bodyMd.includes("zebrafinch"));
await api.delete(`${BASE}/api/notes/${zebra.id}`);
let res = await (await api.post(`${BASE}/api/import`, { data: backup })).json();
ok(res.added.notes === 1, "restore brings back the deleted note");
res = await (await api.post(`${BASE}/api/import`, { data: backup })).json();
ok(Object.values(res.added).every((n) => n === 0), "restoring again adds nothing (merge, no duplicates)");
ok((await api.post(`${BASE}/api/import`, { data: { hello: 1 } })).status() === 400, "non-backup files are rejected");

// restore through the Settings UI
await api.delete(`${BASE}/api/notes/${zebra.id}`);
await page.goto(BASE + "/settings");
const fs = await import("node:fs");
fs.writeFileSync(`${SHOTS}/backup.json`, JSON.stringify(backup));
await page.getByLabel("Backup file").setInputFiles(`${SHOTS}/backup.json`);
await page.getByRole("status").filter({ hasText: "Restored 1 notes" }).waitFor();
ok(true, "Settings → Restore from backup works");
fs.unlinkSync(`${SHOTS}/backup.json`);

// --- installability
const man = await (await anon.request.get(`${BASE}/manifest.webmanifest`)).json();
ok(man.name === "Open Bible" && man.display === "standalone" && man.icons.some((i) => i.sizes === "512x512"), "manifest is public and installable");
ok((await anon.request.get(`${BASE}/icon/192`)).headers()["content-type"] === "image/png", "icons are public PNGs");
const login = await anon.newPage();
await login.goto(BASE + "/login");
ok(await login.locator('link[rel="manifest"]').count() === 1 && await login.locator('link[rel="apple-touch-icon"]').count() === 1, "pages link the manifest and apple-touch-icon");

ok(errors.length === 0, "no page errors (" + errors.join("; ") + ")");
await browser.close();
console.log("ALL PASSED");
