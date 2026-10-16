# Reno Logbook

A mobile-first web app that helps first-time homeowners run their own renovation. Start with
[`CLAUDE.md`](CLAUDE.md), then the specs in [`docs/`](docs).

## Local development

Needs Node 20+ and Docker (for local Supabase).

```bash
npm install
cp .env.example .env.local   # fill in values printed by `npm run db:start`
npm run db:start             # local Supabase (Postgres, Auth, Storage)
npm run dev                  # http://localhost:3000
```

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint (Next.js rules + Prettier compatibility) |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run format:check` | Prettier |
| `npm test` | Vitest unit tests |
| `npm run test:db` | Migrations and Row Level Security against real Postgres |
| `npm run test:e2e` | Playwright at a 390px phone viewport against a local test stack |

`test:db` and `test:e2e` need a Postgres server whose user can create databases, at
`TEST_DATABASE_URL` (default `postgres://postgres@localhost:54329/postgres`). The e2e
run starts PostgREST (downloaded once into `node_modules/.cache`) and a small fake of
Supabase Auth from `e2e/stack/` where any 6-digit code signs you in. It never touches a
real Supabase project.

## Database

Migrations live in `supabase/migrations`. Create one with `npm run db:new <name>` and apply
everything from scratch with `npm run db:reset`.

## Supabase settings

In the Supabase dashboard:

- **Authentication → URL Configuration**: Site URL is the deployed app URL; add
  `<app url>/**` under Redirect URLs.
- **Authentication → Email Templates**: add the code to both **Magic Link** and
  **Confirm signup**, e.g. `<p>Or enter this code: <b>{{ .Token }}</b></p>`. Apps installed to
  an iPhone home screen keep their own cookies, so a tapped link signs you in to Safari, not
  the app; typing the code works in both.
- Google sign-in is optional: enable the Google provider and the button appears.

Invite emails are sent with Resend when `RESEND_API_KEY` is set (`RESEND_FROM` overrides the
sender). Without it, the inviter gets a link to share themselves.

## Deploying (Vercel + Supabase)

1. Create a Supabase project and apply `supabase/migrations/*.sql` in order, with
   `npx supabase link --project-ref <ref>` and `npx supabase db push`, or by pasting each
   file into the SQL Editor.
2. Import this repo in Vercel. Each branch gets a preview URL.
3. Set the variables from `.env.example` in Vercel. `SUPABASE_SERVICE_ROLE_KEY` and
   `ANTHROPIC_API_KEY` must never get a `NEXT_PUBLIC_` prefix.

## Installing on a phone

Open the deployed URL in Safari → Share → **Add to Home Screen**. The app opens full screen
with its own icon. The app shell is cached for spotty site signal; project data is always
loaded fresh.
