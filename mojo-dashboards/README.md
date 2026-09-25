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
