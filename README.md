# Open Bible

A private, web-based Catholic Bible reader. Only you can sign in (passkeys only), it works on any device, it scrolls continuously through all 73 books, and your notes and highlights sit right on the text. It also keeps track of what you've read and where you left off. See [`docs/PLAN.md`](docs/PLAN.md).

**Status:** phases 1–5 of [the plan](docs/PLAN.md) are done:
- passkey auth
- continuous-scroll and page-by-page reading
- inline Markdown notes
- highlights
- automatic progress tracking with cross-device resume

What's left is **phase 6**: swapping in the NABRE text once it's licensed. The text is the public-domain **Douay-Rheims** as a placeholder until the NABRE license comes through.

| Doc | What's in it |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Scope, decisions, translation/licensing, UX, data model, milestones |
| [`docs/wireframes.html`](docs/wireframes.html) | Low-fi wireframes for every screen |
| [`docs/mockup.html`](docs/mockup.html) | Interactive hi-fi mockup of the split reader (phases 2–3) |

## Using notes and highlights

- **Highlight:** select text and pick one of four colors. A highlight can cover part of a verse or run across several. Click a highlight to change its color, remove it, or add a note about it.
- **Add a note:** click a verse number, or select some text and press **✎ Note**. A note made from a selection or a highlight keeps the quoted text.
- **Write in Markdown:** `**bold**`, `*italic*`, lists, `> quotes`, links. Type `[[Jn 3:16]]` to link to a verse. Notes save automatically as you type. **Esc** finishes editing, and ⌘/Ctrl+B or I add formatting.
- **Desktop:** drag the divider to resize the columns (the width is remembered). Hovering a note highlights its verse.
- **Phones:** a ✎ in the margin marks verses that have notes. Tap it, or the ✎ count in the header, to open that chapter's notes.

## Reading modes

- **Scroll** (default): chapters load continuously in both directions.
- **Page**: one chapter at a time. Turn pages with the buttons at the bottom, the ← → keys, or a swipe on a phone.
- Toggle the mode in the header (on phones, it's the ↕ / ⇄ button). Your place is kept when you switch, and each device remembers its own mode.

## Progress

- A verse counts as read once it stays on screen for about 1.5 seconds. Skimming past doesn't count.
- A chapter is marked **✓ Read** once you've read about 90% of its verses. Use the button beside the chapter number to mark it read or unread by hand.
- Opening the app (`/`) on any device takes you back to the verse you were reading.
- The header shows how much of the Bible you've read. Click it for the **Progress** page, which has every book and chapter, totals, and a Continue button.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Postgres + Drizzle ORM · SimpleWebAuthn (passkeys) · iron-session (encrypted cookie) · react-markdown + rehype-sanitize · Vercel.

## Deploy to Vercel (first time)

1. **Install the CLI and link the project:** `npm i -g vercel`, then run `vercel link` in this folder (or import the repo at vercel.com/new).
2. **Add Postgres:** `vercel integration add neon`. This provisions a Neon database and injects `DATABASE_URL`.
3. **Pick your domain now.** Passkeys are bound to it. Either keep the `*.vercel.app` name or attach a custom domain first.
4. **Set env vars** (Project → Settings → Environment Variables, Production):
   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | `openssl rand -base64 32` |
   | `SETUP_TOKEN` | `openssl rand -hex 24` |
   | `WEBAUTHN_RP_ID` | your domain, e.g. `open-bible-owen.vercel.app` |
   | `WEBAUTHN_ORIGIN` | `https://` + that domain |
5. **Create tables and load the text** from your machine against the production DB:
   ```sh
   vercel env pull .env.local
   npm install
   npm run db:migrate
   npm run db:seed        # ~36k verses, takes a few seconds
   ```
6. **Deploy:** `vercel --prod` (or push to `main` once Git is connected).
7. **Enroll your first passkey.** On your phone, open `https://<domain>/setup?token=<SETUP_TOKEN>`, name the device, and confirm with Face ID / fingerprint. The setup page closes for good after this.
8. **Other devices:** passkeys synced through iCloud Keychain or Google Password Manager just work. Otherwise sign in on the new computer using "use a phone" (QR code), then add a passkey in **Settings**.

### Locked out?
If you lose every passkey, set `SETUP_TOKEN` to a **new** value and redeploy. `/setup?token=<new value>` then works once more.

## Local development

```sh
npm install
cp .env.example .env.local   # fill in DATABASE_URL (a Neon dev branch works well), SESSION_SECRET, SETUP_TOKEN
npm run db:migrate
npm run db:seed
npm run dev
```
Open `http://localhost:3000/setup?token=<SETUP_TOKEN>` to enroll a passkey. Browsers allow WebAuthn on `localhost` without HTTPS.

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm run db:generate` | New migration from `src/db/schema.ts` changes |
| `npm run db:migrate` | Apply migrations in `drizzle/` |
| `npm run db:seed [file]` | Load Bible text (default `data/douay-rheims.json`) |

## Switching to NABRE (once licensed)

1. Export the licensed text into the same JSON shape as `data/douay-rheims.json` with `"translation": "nabre"`. **Keep it out of this repo.** The repo is public and the NABRE is copyrighted.
2. `npm run db:seed -- /path/outside/repo/nabre.json`
3. Set `BIBLE_TRANSLATION=nabre` in Vercel and redeploy. The reader shows the required CCD copyright notice automatically.

Book IDs are USFM codes (`GEN`, `JHN`, `SIR`…), so future notes and progress survive the swap.

## Layout

```
src/
  app/
    read/[book]/[chapter]/   reader page (server: loads the first chapter)
    login/ setup/ settings/  passkey sign-in, first-run enrollment, device management
    api/auth/…               WebAuthn options/verify for register + login, logout
    api/chapters/…           chapter JSON for continuous scroll
    api/passkeys/[id]        revoke a passkey
    api/notes/…              list/create (by chapter), update, delete notes
    api/highlights/…         list/create (by chapter), recolor, delete highlights
    api/progress/…           batched verse reads + position, manual mark, summary
    progress/                progress page (books × chapters grid)
  components/reader/         Reader (infinite scroll + split layout), BookPicker, ActionPopover (selection → highlight/note)
  components/highlights/     highlight store
  lib/progress/              completion rules, summary, resume position
  components/notes/          note store, NoteCard (Markdown, autosave), aligned column, mobile sheet
  components/auth/ settings/ client-side passkey flows
  db/                        Drizzle schema + client
  lib/auth/                  session, setup token, relying-party config
  lib/bible/                 canon (books.ts), text access (text.ts), reference parser (refs.ts)
  proxy.ts                   redirects anything without a session to /login
data/douay-rheims.json       public-domain placeholder text (see NOTICE.md)
e2e/                         Playwright end-to-end suites (see e2e/README.md)
drizzle/                     SQL migrations
scripts/seed.ts              loads text into Postgres
```

## Placeholder-text quirks

The Douay-Rheims follows the Latin Vulgate, so some details won't match the NABRE:
- **Psalm numbers** are mostly one behind: DR Psalm 22 is "The Lord ruleth me" (NABRE Psalm 23).
- **Chapter counts** differ: Joel has 3 chapters (NABRE 4), Malachi 4 (NABRE 3), and Esther 16 (NABRE uses 10 plus lettered additions).
- Book names in the UI already use NABRE names (Joshua, 1 Samuel, Sirach…), even where the DR says Josue, 1 Kings, Ecclesiasticus.

The source data had a dozen chapters with typo'd verse numbers (e.g. a duplicated "6" where "5" belonged). These were renumbered by position during conversion.

## License

- **Code and docs:** [MIT](LICENSE).
- **Douay-Rheims text** (`data/`): public domain. The JSON structure is adapted from an MIT-licensed dataset. See [`NOTICE.md`](NOTICE.md) for provenance and attributions.
- **NABRE:** © Confraternity of Christian Doctrine. It is not included here and needs a license from CCD before it can be loaded into a private deployment.
