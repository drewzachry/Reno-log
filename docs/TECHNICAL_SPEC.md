# Technical spec: Reno Logbook

## Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | Next.js (App Router) + TypeScript | One codebase for UI and server routes; first-class on Vercel |
| Hosting | Vercel | Push-to-deploy from GitHub, preview deploys per branch, custom domain |
| Database | Supabase Postgres | Relational data fits this domain; Row Level Security handles sharing |
| Auth | Supabase Auth: email magic link + Google sign-in | No passwords for a non-technical audience |
| File storage | Supabase Storage (private buckets) | Same permissions model as the database |
| Search over documents | Postgres full-text search, plus `pgvector` embeddings in v1.1 | Start simple; add semantic search when needed |
| Realtime | Supabase Realtime on project tables | Spouse sees changes live |
| AI | Anthropic Claude API, called only from the server | See `AI_BEHAVIOR.md` |
| Email | Resend (invites, weekly backup, digests) | Simple API, good deliverability |
| Background jobs | Vercel Cron + a `jobs` table, or Inngest | Document reading, weekly backups, reminders |
| Styling | Tailwind CSS, design tokens from the prototype | Fast, consistent, dark mode |
| Installable app | PWA manifest + service worker for offline shell | "Add to Home Screen" on iPhone and Android |
| Errors / analytics | Sentry, PostHog | Know when AI parsing or uploads fail |

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `ANTHROPIC_API_KEY` (server only), `RESEND_API_KEY`, `APP_URL`.

## Data model

All tables have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`. Money is integer cents. Every project-scoped table has `project_id uuid not null references projects`.

```
profiles            id (= auth.users.id), display_name, email, created_at

projects            name, address, scope, owner_id → profiles,
                    weekly_backup boolean default true, archived_at

project_members     project_id, user_id → profiles,
                    role text check in ('owner','editor','viewer'),
                    invited_by, joined_at
                    unique (project_id, user_id)

invitations         project_id, email (lowercased), role ('editor'|'viewer'),
                    token_hash, invited_by, expires_at, accepted_at, revoked_at

milestones          project_id, key ('rough_in','drywall','cabinets',
                    'countertops','finish','move_in' | custom), label,
                    explanation, date, sort_order

decisions           project_id, title, room, category, why,
                    milestone_key, lead_weeks int, due_date_override date null,
                    status ('not_started','exploring','decided','ordered',
                            'delivered','installed'),
                    selection text, cost_cents int, bucket_id null,
                    source text (e.g. "Plans p.A-201"), deleted_at
                    -- decide_by is computed: coalesce(due_date_override,
                    --   milestone.date - lead_weeks * 7)

decision_options    decision_id, label, price_cents, url, notes,
                    photo_file_id, chosen boolean      (v1.1)

budget_buckets      project_id, name, kind ('contract','allowance',
                    'owner','contingency'), budget_cents, sort_order

ledger_entries      project_id, kind ('invoice','payment','change_order',
                    'credit'), date, vendor, description, amount_cents,
                    bucket_id, file_id null, flags text[],
                    change_order_status ('proposed','approved','rejected') null,
                    deleted_at

files               project_id, storage_path, original_name, mime_type,
                    size_bytes, uploaded_by, kind ('photo','invoice',
                    'document','other')

photos              project_id, file_id, room, caption, taken_on date,
                    decision_id null

documents           project_id, file_id, title, kind ('plans','contract',
                    'specs','estimate','permit','schedule','inspection',
                    'other'), summary, page_count, status ('reading',
                    'ready','failed'), error

document_facts      document_id, project_id, topic, detail, page int null

document_chunks     document_id, project_id, page int, text,
                    tsv tsvector generated, embedding vector null (v1.1)

project_facts       project_id, fact text, category ('preference',
                    'constraint','person','vendor','other'),
                    source_message_id, created_by, retired_at
                    -- durable things said in chat, see "How the app remembers"

messages            project_id, author_id null (null = assistant), role
                    ('user','assistant'), text, file_ids uuid[]

proposals           message_id, project_id, type, payload jsonb,
                    state ('pending','confirmed','dismissed','failed'),
                    decided_by, decided_at

events              project_id, actor_id, type ('decision','invoice',
                    'schedule','photo','document','note','fact','member',
                    'setup','budget'), entity_type, entity_id,
                    summary text, before jsonb, after jsonb, reason text,
                    proposal_id null
                    -- append-only: no UPDATE or DELETE grants, ever

jobs                type, payload jsonb, status, attempts, run_after, error
```

Indexes: `(project_id)` on every project table; `(project_id, created_at desc)` on `messages` and `events`; GIN on `document_chunks.tsv`.

## Permissions (Row Level Security)

- A helper SQL function `project_role(project_id) returns text` reads `project_members` for `auth.uid()`.
- **Select:** any member of the project.
- **Insert/update** on decisions, ledger, milestones, buckets, photos, documents, facts, proposals: role in (`owner`, `editor`).
- **Messages:** any member may insert their own message (viewers can ask questions). Only the server inserts assistant messages.
- **Events:** insert only through server functions using the service role; select for members; no update or delete for anyone.
- **project_members / invitations:** select for members; insert/update/delete only by owner, or by editor when inviting editor/viewer roles.
- **Storage:** bucket path `projects/{project_id}/...`; policies mirror the table rules using the same helper.
- Write RLS tests: a viewer cannot confirm a proposal; a non-member cannot read anything; an editor cannot remove the owner.

## Write path

Every change to the record goes through one server module, for example `lib/actions/applyProposal.ts`:

1. Load the proposal and the caller's role. Reject if the caller isn't owner or editor, or if the proposal isn't `pending`.
2. Validate the payload again with Zod (the AI produced it, so don't trust it).
3. In one database transaction: apply the change, write the `events` row with before, after and reason, and mark the proposal `confirmed` with `decided_by`.
4. Compute ripple effects (for example, the decisions whose deadline moved) and return them for the UI to show.

Direct edits from the UI (changing a status dropdown) use the same module with a synthetic proposal, so they are logged the same way.

## How the app remembers

The homeowner's question was: how does the app remember the choices and decisions that get made? The model itself remembers nothing between calls. Memory lives in four places, all in the database:

1. **The structured record is the main memory.** Decisions, selections, statuses, budget, ledger, milestones and photos are rows in tables. When Kate confirms "hex marble tile for the primary bath floor, $3,900", that becomes `decisions.selection`, `cost_cents` and `status = 'decided'`. It is there forever, on every device, for every collaborator.

2. **The event log is the memory of how you got here.** Every confirmed change writes an append-only `events` row with before, after, who and why. "Why did we switch from subway tile?" is answered from events, not from a chat that scrolled away. Reversals are new events; nothing is overwritten.

3. **Project facts hold what was said but isn't a decision.** Preferences and constraints that come up in conversation, such as "we want brushed nickel everywhere", "Kate makes the final call on tile", "the GC's office manager is Lisa, she handles invoices", "no work before 8am, HOA rule". The AI proposes these as `remember_fact` cards; once confirmed, they go in `project_facts` and are included in every future AI briefing. They can be edited or retired from Project settings.

4. **Documents are the memory of what was promised.** Plans, contracts and specs are stored as originals, as key facts with page numbers, and as searchable page text, so the AI can quote what the contract actually says.

**Every AI call gets a fresh briefing** assembled on the server from those four sources:

- Project basics and milestones with dates.
- All decisions in compact form (id, title, room, status, decide-by, selection, cost, bucket).
- Budget buckets with paid, committed and remaining.
- The last 15 ledger entries.
- All active project facts.
- Document summaries and key facts.
- The top 6–8 document excerpts relevant to the newest message (full-text search; vector search in v1.1).
- The last ~12 chat turns, for conversational flow only.

Because of this, the AI never needs to "remember" a conversation. Delete the whole chat history and it still knows every decision, every dollar and every promise in the contract. Use prompt caching for the stable parts of the briefing (instructions, decision list, document facts) to keep cost and latency down; check the current Anthropic docs for how caching works.

## Collaborator invitations

Flow:

1. Owner (or editor) opens Project settings → People → "Invite someone", enters an email and a role.
2. Server creates an `invitations` row with a random 32-byte token (store only its SHA-256 hash), `expires_at = now() + 14 days`, and sends a Resend email: "Drew invited you to the Rivera renovation on Reno Logbook" with a link `APP_URL/invite/{token}`.
3. The invite page shows the project name and who invited them. If not signed in, it offers magic-link sign-in pre-filled with the invited email.
4. On accept: server checks the token hash, expiry and revocation, and that the signed-in email matches the invited email (case-insensitive). If the emails differ, show "This invite was sent to k***@gmail.com. Sign in with that email, or ask Drew to invite this address." Then insert `project_members`, set `accepted_at`, write an `events` row ("Kate joined as Editor").
5. Owner can resend, revoke, change roles or remove people. Removing someone writes an event and immediately cuts access through RLS.
6. A user can belong to many projects; a project switcher lives in the header menu.

Also show the inviter a copyable invite link, for spouses who'd rather get it by text.

## Uploads and document reading

- Uploads go straight from the browser to Supabase Storage with a signed upload URL, then a server route records the `files` row.
- Size limits: photos 20 MB, documents 100 MB. Downscale photos to about 2000px on the server for AI calls; keep the original.
- Document reading runs as a background job so the UI never blocks:
  1. Status `reading`. The UI shows progress via Realtime.
  2. For PDFs, extract text per page server-side (for example `pdfjs-dist` or `unpdf`). Pages with little text (drawings, scans) are rendered to images.
  3. Send the document to Claude for the summary and key facts. The Claude API can read PDFs directly, including drawings; check the current docs for PDF support, page limits and the Files API before choosing between sending the whole PDF and sending text plus page images. Large drawing sets may need to be split into page batches.
  4. Store `documents.summary`, `document_facts` and `document_chunks` (one or more per page, including the AI's description of drawing pages so they are searchable).
  5. Status `ready`, plus an event "Document added". On failure, status `failed` with a plain-English error and a retry button.
- Accept PDF, DOCX (convert with `mammoth`), images, TXT/CSV. ZIP files: unzip server-side and treat each PDF inside as a document (architects often send permit sets this way).

## Backups

- Supabase daily backups with point-in-time recovery (paid plan) protect against our own mistakes.
- **Owner-facing backups**: a weekly job emails the owner a backup file containing a readable summary (schedule, decisions, budget, ledger, document facts, history) and the full data as JSON. Originals stay in storage; the backup links to them with long-lived signed URLs.
- "Export now" in Project settings produces the same file on demand.
- v1.1: optional "Save backups to my Google Drive".

## Mobile and installability

- Design at 390px first. Bottom tab bar on phones, chat-left/record-right on desktop. Follow the prototype.
- PWA: manifest, icons, `display: standalone`, service worker caching the app shell. iOS supports web push for installed PWAs; add notifications in v1.1.
- Camera: `<input type="file" accept="image/*">` gives a camera option on phones; also accept PDFs from the Files app.
- Inputs at least 16px font to stop iOS zoom; tap targets at least 44px; respect safe-area insets.

## Security and privacy

- Contracts and invoices are sensitive. Private storage buckets, signed URLs that expire, RLS on everything.
- Never log document contents or message text to third-party logging.
- Treat document text and model output as untrusted: they can never change permissions, call internal endpoints or skip confirmation.
- Rate-limit AI routes per user to protect API spend.
- Let an owner delete a project and everything in it (a hard delete with a confirmation step, the one exception to soft deletes).

## Cost control

- Use a fast, lower-cost Claude model for routine chat turns and invoice reading, and a stronger model for project setup and long document reading. Pick current model IDs from the Anthropic docs.
- Cache the stable briefing with prompt caching.
- Track tokens per project in a `usage` table so pricing can be set later.
