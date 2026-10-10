# Open Bible: Plan v0.2

A private, web-based Catholic Bible reader. Only the owner can sign in, and it works on any device. The core loop is: **read → progress is tracked automatically → highlight and take notes inline**.

> Companion files:
> - [`wireframes.html`](./wireframes.html): low-fidelity layouts for every screen
> - [`mockup.html`](./mockup.html): an interactive high-fidelity mockup of the reader (open it in a browser and try selecting text)

### Decisions (2026-10-09)
| Question | Decision |
|---|---|
| Translation | **NABRE**. Request permission from CCD/USCCB; build on the Douay-Rheims placeholder until it's granted |
| Default reading mode | **Continuous scroll** (page mode is still available as a toggle) |
| Sign-in | **Passkey** (Face ID / Touch ID / Windows Hello / Android). No passwords, no email login |
| Hosting | **Vercel** + Postgres from the Vercel Marketplace (Neon) |
| Notes format | **Markdown** |
| Footnotes | *Still open*: in v1 or later? |

---

## 1. Scope

### In scope (v1)
| # | Feature | Notes |
|---|---------|-------|
| 1 | **Authentication** | Single-user, **passkey only**. Passkeys can only be enrolled with a one-time setup secret or from a device that's already signed in. Every page and API is behind auth. See §4.1. |
| 2 | **Reader** | Full Catholic canon (73 books) in a USCCB-approved translation. Book and chapter navigation. |
| 3 | **Split view** | Desktop/tablet shows the Bible on the left (≈55%) and notes on the right (≈45%). The divider is draggable and the split ratio is remembered. |
| 4 | **Two reading modes** | **Continuous scroll (default)**: chapters load as you scroll, in both directions. **Page by page**: one chapter per page, with ← → keys and buttons. Toggle in the header. |
| 5 | **Inline notes** | Notes are anchored to a verse or a verse range. In the notes pane, each note sits level with its verse, and the two panes scroll together. |
| 6 | **Highlights** | Select text, then pick a color (4 colors). A highlight can cover part of a verse or span several verses. |
| 7 | **Automatic progress** | Tracks which verses and chapters have been read. Resumes where you left off on any device. Includes a progress overview per book and for the whole Bible. |
| 8 | **Sync** | Everything is stored server-side, so it is the same on phone, tablet, and desktop. |

### Out of scope for v1 (parking lot)
Reading plans and liturgical calendar (daily Mass readings), search, cross-references and footnotes, tags, export (Markdown/PDF), offline/PWA, multiple translations side-by-side, sharing.

---

## 2. Translation: NABRE (decided)

USCCB keeps a list of translations [approved for private use and study](https://www.usccb.org/offices/new-american-bible/approved-translations-bible). These entries on the list are **complete Bibles**:

| Translation | Copyright holder | Fit |
|---|---|---|
| **NABRE** (New American Bible, Revised Edition) | Confraternity of Christian Doctrine (CCD) / USCCB | ✅ **Chosen.** This is the USCCB's own translation and is closest to what's read at Mass in the US. |
| NRSV Catholic Edition | National Council of Churches | Good, more literal. Licensing goes through NCC/Friendship Press. |
| NRSVue Catholic Edition | Friendship Press | Newest (imprimatur 2025). The licensing path is the same as for the NRSV-CE. |
| Good News Translation (with Deuterocanonicals) | American Bible Society | Simplest English. ABS licenses digitally (possibly via API.Bible). |

Douay-Rheims is public domain, but it is **not** on the USCCB list. The list does say that translations approved before 1983 by Rome or a local bishop are still OK. We use it only as **placeholder text in mockups and dev seeds** so no copyrighted text sits in the repo.

### Licensing reality
None of these are public domain. The NABRE terms ([USCCB permissions](https://www.usccb.org/offices/new-american-bible/permissions)) allow less than 5,000 words without permission. A full Bible reader needs a license, even for one user.

**Action (owner):** email `nabperm@usccb.org` and ask for permission to use the NABRE text in a private, non-commercial, single-user, authentication-gated personal study app (not publicly accessible, not distributed). Fallback: check the [API.Bible](https://scripture.api.bible) catalog for a Catholic-edition text with an API key that allows personal apps.

### Architecture consequence
The Bible text sits behind a **`TextSource` interface**, so changing the translation is a config change and not a rewrite:
```ts
interface TextSource {
  id: "nabre" | "nrsvce" | "gnt" | "dra";   // dra = Douay-Rheims dev placeholder
  getChapter(book: BookId, chapter: number): Promise<Verse[]>;
  copyrightNotice: string;                  // rendered in the reader footer
}
```
Notes, highlights, and progress are keyed on **canonical verse references** (`JHN.1.14`), not on translation text. They therefore survive a translation swap. The one exception is character offsets inside a highlight (see §5).

---

## 3. UX

### Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰  John ▾  1 ▾        [Scroll | Page]       ▓▓▓▓░░ 42%   ⚙  (O)      │
├───────────────────────────────────┬┬─────────────────────────────────┤
│  JOHN 1                           ││  NOTES · John 1                 │
│                                   ││                                 │
│  ¹ In the beginning was the Word, ││  ┌ v1 ─────────────────────┐    │
│  and the Word was with God…       ││  │ "Word" = Logos. Compare │    │
│  ² The same was in the beginning  ││  │ Gen 1:1.                │    │
│  …                                ││  └─────────────────────────┘    │
│  ⁵ And the light shineth in       ││                                 │
│  ▒darkness▒…                      ││  ┌ v5 ──────────────────┐       │
│                                   ││  │ …                    │       │
│                                   ⇔│  └──────────────────────┘       │
│                                   ││  + Add note at v14              │
└───────────────────────────────────┴┴─────────────────────────────────┘
```

* **Note alignment:** each note card's top lines up with its anchor verse. When cards would overlap, they push down and stack, and a thin connector line keeps the link to the verse. Hovering a note tints its verse, and hovering a verse tints its notes.
* **Selection popover:** select text and a small toolbar appears: `● ● ● ● | ✎ Note | ⧉ Copy`. Clicking a color highlights the text. Clicking *Note* creates a note anchored to the selection and focuses it in the right pane.
* **No selection:** hovering a verse number shows `+`, which creates a verse-level note.
* **Notes editor (Markdown):** a note card shows **rendered Markdown** by default. Clicking it or pressing Enter switches it to a monospace textarea, and blur or Esc switches it back to rendered. Supported: **bold**, *italic*, lists, `>` quotes, links, headings, and inline code. Verse references typed as `[[Jn 3:16]]` become links that jump to that verse. Autosave runs after 800 ms of inactivity with a ✓ indicator, and there is no save button. Shortcuts: Ctrl/⌘+B and Ctrl/⌘+I.
* **Rendering safety:** Markdown is rendered with `react-markdown` + `rehype-sanitize`, with no raw HTML. That matters even for one user, because the notes are shown on every device you sign in from.
* **Mobile (< 768px):** the Bible takes the full width. Verses with notes get a small ✎ marker in the gutter. Tapping it, or the notes button, opens a **bottom sheet** with those notes. A swipe-up gives the full notes list for the chapter.

### Reading modes
| | Continuous scroll | Page by page |
|---|---|---|
| Unit | Chapters stream in (virtualized), with sticky chapter headers | One chapter per page |
| Nav | Scroll, or jump via the picker | ← → keys, swipe on touch, buttons at the bottom |
| URL | Updates to `/read/JHN/3` as you cross chapter boundaries | `/read/JHN/3` |
| Notes pane | Follows the scroll | Shows the current chapter's notes |

### Progress tracking (automatic)
* A verse counts as **read** once it has been ≥ 50% visible in the viewport for a total of 1.5 s or more, with the tab focused. An `IntersectionObserver` handles this, and reads are batched to the server every 5 s and on `visibilitychange`.
* A chapter counts as **complete** when ≥ 90% of its verses are read. Requiring 90% instead of 100% means one skipped verse doesn't block completion.
* **Resume position:** the last visible verse is saved, and "Continue reading" opens there on any device.
* The progress page shows a grid of 73 books, each colored by percent complete, with chapters as small squares. It also shows totals and a "last read" timestamp.
* Manual override: **Mark chapter read / unread**.

---

## 4. Tech stack (proposed)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | One codebase for UI and API, with server components to render chapters fast |
| Hosting | **Vercel** | Free tier is fine for one user; preview deploys |
| DB | **Postgres** (Neon via Vercel Marketplace) + **Drizzle ORM** | Relational data, a cheap/free tier, typed queries |
| Auth | **Passkeys via `@simplewebauthn/server` + `@simplewebauthn/browser`**, with a session in an encrypted, HTTP-only cookie (`iron-session`) | Small, well-maintained, and fully under our control. Auth.js's passkey provider is still experimental, and Clerk is overkill for one user. See §4.1. |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | Safe rendering; supports GFM lists and links |
| Styling | Tailwind CSS | Fast iteration on the reader typography |
| Text storage | `verses` table seeded from the licensed source, or fetched from API.Bible and cached | Depends on the license (§2) |

Security notes: every route sits behind middleware that checks the session cookie, and every API handler and server action re-verifies the session. HTTPS is enforced, and responses send `noindex` headers plus `X-Robots-Tag`.

### 4.1 Passkey auth design (single user)

**The bootstrap problem:** with no passwords and no email, how does the first passkey get registered? The answer is a one-time setup secret.

```
First run
  1. Set env var SETUP_TOKEN (long random string) in Vercel.
  2. Visit /setup?token=…  → page calls generateRegistrationOptions()
  3. Face ID / Windows Hello → verifyRegistrationResponse() → store credential
  4. App records "owner enrolled"; /setup is disabled from then on (404),
     even with the token. Remove SETUP_TOKEN from Vercel afterward.

Every sign-in
  /login → generateAuthenticationOptions() → biometric prompt
        → verifyAuthenticationResponse() (checks signature + counter)
        → set encrypted session cookie (30-day rolling, HttpOnly, Secure, SameSite=Lax)

Adding another device
  Signed in on device A → Settings → "Add a passkey" → register on device A
  (passkeys sync via iCloud Keychain / Google Password Manager), or use
  the cross-device QR flow when signing in from a new laptop with your phone.
  Settings lists passkeys with nickname + last used, and each can be revoked.

Lockout recovery
  Lost every passkey? Set a new SETUP_TOKEN plus RECOVERY=1 in Vercel and redeploy.
  /setup re-opens for a single enrollment, then locks again.
```

* **Challenge storage:** the WebAuthn challenge is kept in a short-lived (5 min) signed cookie, so no extra table is needed.
* **RP ID** = the production domain. Passkeys are bound to the domain, so choose the final domain (or the `*.vercel.app` name) **before** enrolling. Changing it later means re-enrolling.
* **Preview deploys:** they live on different domains, so passkeys won't work there. Previews are protected with Vercel Deployment Protection, and auth is only tested on production or localhost.

---

## 5. Data model

```sql
-- Auth
passkeys  (id TEXT PK,                         -- credential ID (base64url)
           public_key BYTEA, counter BIGINT,
           transports TEXT[], device_type TEXT, backed_up BOOLEAN,
           nickname TEXT, created_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ)
app_meta  (key TEXT PK, value TEXT)            -- e.g. owner_enrolled_at

-- Reference data (seeded)
books     (id TEXT PK,           -- 'GEN', 'JHN', 'SIR' … (USFM codes)
           name TEXT, testament TEXT, canon_order INT, chapter_count INT)
verses    (translation TEXT, book_id TEXT, chapter INT, verse INT,
           text TEXT,
           PRIMARY KEY (translation, book_id, chapter, verse))

-- User data (single user, but keep user_id for safety)
highlights (id UUID PK, user_id TEXT,
            start_ref TEXT, start_offset INT,    -- 'JHN.1.5', char offset in verse
            end_ref   TEXT, end_offset   INT,
            color TEXT CHECK (color IN ('yellow','green','blue','pink')),
            translation TEXT,                    -- offsets are translation-specific
            created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

notes      (id UUID PK, user_id TEXT,
            start_ref TEXT, end_ref TEXT,        -- verse range anchor
            quote TEXT NULL,                     -- selected text at creation (context)
            body_md TEXT,                        -- Markdown source; rendered client-side
            highlight_id UUID NULL REFERENCES highlights,
            created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

verse_reads (user_id TEXT, book_id TEXT, chapter INT, verse INT,
             first_read_at TIMESTAMPTZ,
             PRIMARY KEY (user_id, book_id, chapter, verse))

chapter_progress (user_id TEXT, book_id TEXT, chapter INT,
                  completed_at TIMESTAMPTZ NULL, manual BOOLEAN DEFAULT false,
                  PRIMARY KEY (user_id, book_id, chapter))

reading_state (user_id TEXT PK, book_id TEXT, chapter INT, verse INT,
               mode TEXT, split_ratio REAL, updated_at TIMESTAMPTZ)
```

There are about 35k verses, so `verse_reads` stays small for a single user even after reading the whole Bible.

### API (route handlers / server actions)
```
GET    /api/chapters/:book/:ch          → verses + highlights + notes for chapter
POST   /api/progress/reads              ← [{ref}] batch
POST   /api/progress/chapter            ← {book, ch, completed}
GET    /api/progress/summary            → per-book %
PUT    /api/state                       ← resume position / prefs
POST   /api/highlights   PATCH/DELETE /api/highlights/:id
POST   /api/notes        PATCH/DELETE /api/notes/:id
```

---

## 6. Milestones

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Decide** | ✅ Decisions made (see top). ⏳ NABRE permission email sent by owner | License reply received |
| **1. Skeleton** | Next.js app on Vercel, Neon Postgres + Drizzle, **passkey auth** (setup, login, add device), Douay-Rheims dev seed (73 books), book/chapter picker, **continuous-scroll reader** | I can enroll a passkey and read John 1 → 2 by scrolling, on my phone |
| **2. Split view + notes** | Resizable split, verse-anchored **Markdown** notes with aligned layout, autosave, mobile bottom sheet | Notes appear beside their verse on desktop and in a sheet on mobile |
| **3. Highlights** | Selection popover, 4 colors, multi-verse ranges, highlight → note | Highlights persist and render after reload on another device |
| **4. Progress** | Auto read tracking, resume, progress page | Reading Mark straight through shows Mark at 100% |
| **5. Page mode** | Page-by-page toggle, ← → keys, swipe | Toggling keeps my position |
| **6. Real text** | Swap the `TextSource` to the licensed translation | NABRE (or the chosen text) renders with its copyright notice |

---

## 7. Risks
* **Licensing:** the biggest blocker for the real text. Phases 1–5 can proceed on the placeholder text in the meantime.
* **Highlight offsets** break if the translation changes. Mitigation: store `translation` on each highlight, and also keep the `quote` text so a highlight can be re-anchored by fuzzy match.
* **Note alignment** with very long notes or dense chapters. Mitigation: stacking with a collapse/expand control ("+3 more").

---

## 8. Open questions
1. ~~Translation~~ → NABRE · ~~Default mode~~ → scroll · ~~Sign-in~~ → passkey · ~~Hosting~~ → Vercel · ~~Notes~~ → Markdown
2. **Footnotes:** NABRE has extensive footnotes. Show them in v1 (as a third tab in the notes pane), or later? This only matters once the licensed text is in.
3. **Domain:** use `open-bible-<you>.vercel.app` or a custom domain? Decide before enrolling a passkey (§4.1).
