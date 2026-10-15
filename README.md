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
| `npm run test:e2e` | Playwright at a 390px phone viewport (builds and starts the app) |

## Database

Migrations live in `supabase/migrations`. Create one with `npm run db:new <name>` and apply
everything from scratch with `npm run db:reset`.

## Deploying (Vercel + Supabase)

1. Create a Supabase project and link it: `npx supabase link --project-ref <ref>`, then
   `npx supabase db push`.
2. Import this repo in Vercel. Each branch gets a preview URL.
3. Set the variables from `.env.example` in Vercel. `SUPABASE_SERVICE_ROLE_KEY` and
   `ANTHROPIC_API_KEY` must never get a `NEXT_PUBLIC_` prefix.

## Installing on a phone

Open the deployed URL in Safari → Share → **Add to Home Screen**. The app opens full screen
with its own icon. The app shell is cached for spotty site signal; project data is always
loaded fresh.
