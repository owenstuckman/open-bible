# End-to-end tests

Browser tests that drive a **production build** with Playwright. Passkeys run through Chrome's virtual WebAuthn authenticator, so no real Face ID or security key is needed.

| Suite | Covers |
|---|---|
| `auth-reader.mjs` | Sign-in gate, `/setup` enrollment (once only), passkey sign-in/out, `?next` handling, continuous scroll, prepend anchoring, book picker, settings |
| `notes.mjs` | Verse-number and selection notes, Markdown and `[[ref]]` links, autosave, alignment, hover linking, delete, XSS sanitizing, divider, mobile sheet |
| `highlights.mjs` | Single and multi-verse highlights, offsets, recolor, remove, note from highlight, validation, mobile toolbar |
| `progress.mjs` | Dwell-based reading, skim rejection, manual mark/unmark, cross-device resume without drift, beacon on page hide, progress page |
| `page.mjs` | Page mode: mode switch keeps the verse, pager, arrow keys, persistence, book boundaries, swipe, mobile header |
| `search-data.mjs` | Bible/notes search (phrases, scopes, references, `/` shortcut), notes page, Markdown/JSON export, restore (merge, no duplicates), install manifest and icons |
| `plans.mjs` | Start/stop plans, today's chapters, behind count and continue link (backdated start), two plans at once, validation, mobile |
| `footnotes.mjs` | Footnote markers placed after their phrase, popover, chapter list, highlight across a marker, settings toggle, mobile |

## Running

Use a **throwaway database**: the suites create and delete notes, highlights, and progress.

```sh
npx playwright install chromium          # once (or set CHROME_PATH to an existing Chrome/Chromium)
npm run build && npm start -- -p 3100    # in one terminal, with .env.local pointing at the test DB

# auth-reader needs a fresh DB (no passkeys yet) and the SETUP_TOKEN from .env.local:
TOKEN=<SETUP_TOKEN> node e2e/auth-reader.mjs

# The others sign in by minting a session cookie, so they need SESSION_SECRET and the id
# of an existing passkey (e.g. the one auth-reader just enrolled):
#   select id from passkeys limit 1;
export SESSION_SECRET=<from .env.local> PKID=<passkey id>
node e2e/notes.mjs && node e2e/highlights.mjs && node e2e/progress.mjs && node e2e/page.mjs && node e2e/footnotes.mjs && node e2e/search-data.mjs && node e2e/plans.mjs
```

Unit tests (no browser or database needed) run with `npm test`.

Screenshots go to `e2e/.shots/` (gitignored). Set `BASE_URL` to test somewhere other than `http://localhost:3100`.
