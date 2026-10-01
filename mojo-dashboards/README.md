# Mountain Mojo Client Dashboards

A small Next.js app that replaces the one-off Claude Artifact dashboard
with something that scales to all of Mountain Mojo's clients from a
single deployment. One app, one database, unlimited client dashboards
— each at its own private link.

## How it works

- **One codebase, many clients.** Every client is a row in a `Client`
  table (name, a private `slug`, and a `content` JSON blob holding
  everything the dashboard shows — stats, store notes, review items,
  questions, and so on).
- **Private link, no client login.** A client's dashboard lives at
  `/c/<their-unguessable-slug>` — e.g. `/c/timberline-ace-hardware`.
  Anyone with the link can view it; there's no password for clients to
  manage or forget. Treat the link itself as the access control, the
  same way you'd treat a private Google Doc link.
- **Click-to-edit, staff-only.** Your team signs in once at
  `/staff-login` with one shared team password. Once signed in, every
  client dashboard you open shows an "Edit this page" button in the
  sidebar — click it, edit any text inline (like a Google Doc), click
  Save. No separate CMS, no markdown, no redeploying.
- **`/admin`** lists every client with a link to their dashboard and a
  "New client" button that spins up a blank dashboard (and a fresh
  private slug) in one step.

## Local setup

```bash
npm install
cp .env.example .env    # then fill in the three values below
npx prisma generate
npx prisma db push      # creates the Client table
npm run seed             # optional: loads the real Timberline Ace content
npm run dev
```

Open `http://localhost:3000` — it'll send you to `/staff-login`.

### Environment variables (`.env`)

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Postgres connection string. Any managed Postgres works — Vercel Postgres, Neon, Supabase, Railway, RDS. |
| `STAFF_PASSWORD` | The one shared password your team uses to sign in. Everyone uses the same one — there are no individual accounts. |
| `SESSION_SECRET` | Random string used to sign login sessions. Generate one with `openssl rand -hex 32`. Changing it logs everyone out. |

## Deploying (Vercel is the easy path)

1. Push this folder to a GitHub repo.
2. Import it into Vercel.
3. Add a Postgres database — Vercel's own Postgres integration is the
   fastest way (Storage tab → Create Database → Postgres); it sets
   `DATABASE_URL` for you automatically. Otherwise create one anywhere
   and paste its connection string into `DATABASE_URL` under
   Vercel's Environment Variables.
4. Add `STAFF_PASSWORD` and `SESSION_SECRET` under Environment
   Variables too.
5. Deploy. The build script (`prisma generate && prisma migrate deploy
   && next build`) creates the `Client` table automatically on first
   deploy — you don't need to run migrations by hand.
6. Point your domain at it (e.g. `dashboards.mountainmojogroup.com`)
   in Vercel's Domains settings.
7. Sign in at `/staff-login`, hit `/admin`, and create your first
   client (or run `npm run seed` once against the production database
   to load the real Timberline Ace content instead of starting blank).

Any host that runs Next.js + Postgres works the same way — Vercel is
just the least setup.

## Day-to-day use

- To send a client their dashboard: open `/admin`, click into their
  row, copy the URL from your browser, send it to them. That's the
  whole "share" step — no invite flow.
- To update a client's numbers before a monthly meeting: open their
  link, click "Edit this page," make your changes, click "Save
  changes." The client sees the update live the next time they open
  the link — nothing to re-send.
- To retire a client (stop billing them, end the engagement): for now,
  the simplest option is deleting their row via `DELETE
  /api/clients/<slug>` (staff-only) or directly in your database
  client. A "deactivate" toggle in `/admin` would be a natural next
  addition if you want to keep the history around instead of deleting
  it.

## Relationship to the original Claude Artifact

The Timberline Ace Artifact you already have
(`claude.ai/artifact/RETQTt9v5XbmxB2CKUEg92`) still works exactly as
it did — nothing about it changes. This app is a separate, parallel
way to host the same kind of dashboard, built for the "we need ~30 of
these" scale the Artifact wasn't designed for (one URL per client,
shared login for your team instead of Claude's artifact permissions,
your own domain). You can run both side by side, move Timberline Ace
over to this app once you're happy with it (the seed script already
has its real content), and use this app for every new client going
forward — or keep using Artifacts for one-offs and this app for the
clients you want on your own domain. Whichever way you want to split
it, both are backed by the same underlying dashboard design.

## Extending it

Everything a client dashboard shows lives in one JSON shape, defined
in `lib/contentTemplate.js` (`blankContent()`) and rendered by
`components/Dashboard.js`. To add a new section (say, a "Budget"
panel): add its default shape to `blankContent()`, add a template
factory to `ITEM_TEMPLATES` if it has repeatable items, add it to
`NAV_SECTIONS` so it shows up in the sidebar, and add its JSX block to
`Dashboard.js` following the pattern the existing sections use
(`Editable` for text, `RemoveBtn`/`AddBtn` for list items). No
database migration needed — it's all inside the existing `content`
JSON column.

## Links & buttons

Every text box on a dashboard supports clickable links:

- **Auto-links.** Type or paste a web address (`kenkilday.com/blog`),
  email address or phone number into any text box and it becomes
  clickable automatically. Links open in a new tab and are underlined
  in the client's brand color with a small arrow.
- **Link (format bar).** Highlight some text, click **Link**, paste the
  address. The highlighted text becomes the link, so long URLs never
  have to show on the page.
- **Button (format bar).** Inserts a solid call-to-action button
  ("Review the October content ->") in the client's brand color at the
  cursor.
- **Card buttons.** Ready for Review items, questions, events, meetings
  and custom-section cards each have an optional "+ Add button link" in
  edit mode, which puts a consistent button at the bottom of the card.

While editing, clicking a link or button opens an Open / Edit / Remove
menu instead of following it.

Safety: only http, https, mailto and tel links are allowed
(`lib/links.js`), and the server re-checks every link on save
(`lib/sanitize.js`), forcing external links to open in a new tab with
rel="noopener noreferrer". Anything else is stripped to plain text.

## Weekly Update & Monthly Meeting tabs

Each client's link has two tabs:

- **Weekly Update** -- the weekly touch point: Ready for Review,
  Questions & Updates, What We're Working On, Approved & Live, and
  upcoming dates. Stored in `Client.content` (which also holds the
  shared `meta`: client name, logo, contact info).
- **Monthly Meeting** -- the monthly agenda: goal progress, goal
  scorecard, highlights, report review, what's upcoming, action items,
  next meeting. Stored in `Client.monthlyContent`. The client doesn't
  see this tab until it's been set up and published. It shows a short
  "From the weekly update" pointer to anything still open on the
  Weekly tab, so those items live in one place only.

Both tabs use the same section building blocks, and every built-in
section's eyebrow/heading is now editable (`content.headings`).

**Present mode** (Monthly tab, "▶ Present"): full-screen, one section
per slide, with a title slide and a wrap-up slide. Arrow keys / space
to move, Esc to exit.

## Drafts, publishing and history

- Turn a tab to **Draft** from the client list (`/admin`) or the
  "Start a draft" button on the page. The client keeps seeing the
  published version while the team edits the draft
  (`Client.draftContent` / `draftMonthlyContent`).
- **Preview client view** shows the published version; **Publish draft**
  makes the draft live; **Discard draft** throws it away.
- Every publish (and restore) saves the version it replaces to
  `ClientVersion` (staff-only, newest 25 per tab). **History** lists
  them with a Restore button.
- If the client approves or comments on the published page while a
  draft is open, the response is copied onto the matching item (same
  title) in the draft, so publishing doesn't lose it.
- Logo, brand color and contact details aren't drafted -- they always
  save straight to the live page.
- Publishing the Weekly tab opens **this week's update email**, ready to
  copy into your own email (also available any time from "✉ Weekly
  email").

API: `POST /api/clients/<slug>/draft` `{ view, action: start|publish|discard|restore, versionId? }`,
`GET /api/clients/<slug>/versions?view=`, and `PUT /api/clients/<slug>`
now takes optional `view` (weekly|monthly) and `target` (live|draft).
The public `GET /api/clients/<slug>` never includes drafts.

Database: the first deploy adds four nullable columns and one table via
`prisma db push` (part of the build script). Nothing existing is
changed; existing clients' content becomes their Weekly Update tab.

## Brand colors, link previews, portal password

- **Brand colors** (edit mode, sidebar): each client has a palette of
  3-6 colors (`meta.brandColors`). Pick which one drives the **header &
  accents** (`accentColor`) and which one the **buttons** use
  (`meta.buttonColor`), so call-to-action buttons can stand out in a
  different brand color. The palette also shows up in the format bar
  (text color and background) and in the button dialog, where any one
  button can use a different brand color.
- **Link previews**: `app/c/[slug]/opengraph-image.js` (and
  `twitter-image.js`) render a 1200x630 preview image -- the client's
  brand gradient and mountain graphic, their logo, name, and "Client
  Dashboard · Mountain Mojo Group". Previews use `SITE_URL` if set,
  otherwise https://mountainmojostudios.com, for absolute image URLs.
  Slack caches previews, so a link already shared may keep its old
  (blank) preview for a while.
- **Portal password**: no longer part of edit mode. The sidebar shows
  whether it's on; changing it happens in its own dialog (typed twice),
  and turning it off is a separate, confirmed step.
