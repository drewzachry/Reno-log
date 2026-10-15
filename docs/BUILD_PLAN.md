# Build plan: Reno Logbook

Work one phase at a time. Each phase ends deployed to a Vercel preview URL that Drew can open on his phone. Don't start the next phase until the acceptance checks pass.

## Phase 0: Foundation (day 1–2)

- Next.js + TypeScript + Tailwind, ESLint, Prettier, Vitest, Playwright.
- Supabase project; migrations folder checked into the repo; local dev with the Supabase CLI.
- Vercel project linked to GitHub with preview deploys; environment variables set.
- Design tokens from `prototype/reno-logbook.html` (colors, fonts, light and dark).
- PWA manifest and icons.

**Done when:** an empty app with the bottom tab bar deploys to a preview URL and installs to an iPhone home screen.

## Phase 1: Accounts, projects and collaborators

- Supabase Auth with magic link and Google.
- Tables: profiles, projects, project_members, invitations, events. RLS and the `project_role` helper.
- Create project (name only for now), project switcher, Project settings → People.
- Invite by email (Resend) and by copyable link; accept flow with email match; roles; revoke; remove.

**Done when:** Drew creates a project, invites a second email as Editor, that person accepts on a phone and sees the project; a Viewer cannot edit; removing someone cuts access immediately. RLS tests pass.

## Phase 2: The record (no AI yet)

- Tables: milestones, decisions, budget_buckets, ledger_entries, files, photos.
- Screens: Decisions (three groupings, status changes), Schedule, Budget (buckets, totals, ledger), Photos, History.
- The shared write path (`applyProposal`) with event logging, used by every edit.
- Decide-by computation and the Up next logic, with unit tests.
- Realtime: changes appear on a second device without refresh.
- Seed script that loads the sample Rivera project from the prototype.

**Done when:** every number and date in the sample project matches the prototype; changing the rough-in date moves 13 deadlines and History shows one event with before and after.

## Phase 3: Chat with proposals

- Tables: messages, proposals, project_facts.
- Server route for a chat turn: build the briefing, call Claude with tool definitions, validate, store the reply and pending proposals.
- Proposal cards with Log it and Not now; server-side budget warnings; ripple messages after confirm.
- Photo attachments: upload, downscale for the model, keep the original.
- remember_fact proposals and a Project settings list of remembered facts.
- Rate limiting and token tracking.

**Done when:** these all work on a phone:
- "GC says drywall moved to Nov 23" proposes a schedule card that moves the right deadlines.
- A photo of a real invoice proposes a correct invoice card.
- A photo of a tile sample proposes a decision update.
- "We want brushed nickel everywhere" proposes a remembered fact that later answers use.
- A Viewer can ask questions but sees no Log it buttons.

## Phase 4: Documents

- Tables: documents, document_facts, document_chunks, jobs.
- Upload from the Documents tab and from chat; background reading job with live progress; ZIP and DOCX handling.
- Documents tab with summaries, key facts and originals.
- Chat retrieval with page citations.
- "Your plans name N things not on your list" follow-up.

**Done when:** Drew's real permit set (unzipped) and contract read successfully, and questions like "What's excluded from my contract?" and "What size is the primary shower?" are answered with the right page.

## Phase 5: Onboarding

- New project flow: documents → questions with prefill → build my decision map → preview → save.
- Decision library as a seed table.

**Done when:** a person who has never seen the app sets up a project from a contract and plans in under 15 minutes, and the decisions match what the plans show.

## Phase 6: Backups, reminders, polish

- Weekly backup email and Export now.
- Daily reminder digest (email), then web push for installed PWAs.
- Empty states, error states and plain-English error copy everywhere.
- Accessibility pass (keyboard, screen reader labels, contrast in both themes).
- Sentry and PostHog.

**Done when:** a backup email arrives with a readable summary and the full data; a decision 7 days out triggers exactly one reminder.

## Later

Decision options for comparing candidates, contractor read-only access, Google Drive backups, vector search, custom milestones, a timeline view, multiple currencies and locales, and native apps via Capacitor if PWA limits bite.
