# Reno Logbook

A hosted, mobile-first web app that helps homeowners with little renovation experience run their own renovation. The core interaction is a chat: the homeowner tells the app what happened, drops in invoices, photos and documents, and the AI turns that into a structured project record they confirm with one tap. The app also tells them which decisions they need to make, and by when, so they stay ahead of their contractor.

Read these before writing code, in this order:

1. `docs/PRODUCT_SPEC.md`: what we are building and why, screen by screen.
2. `docs/TECHNICAL_SPEC.md`: stack, data model, permissions, hosting, invitations, how memory works.
3. `docs/AI_BEHAVIOR.md`: prompts, action schemas, document reading, the decision library.
4. `docs/BUILD_PLAN.md`: phases and acceptance criteria. Work one phase at a time.
5. `prototype/reno-logbook.html`: a working single-file prototype. Use it as the reference for UX, copy and behavior, not for architecture. It stored data in a sandbox; the real app uses the stack in the technical spec.

## Non-negotiable product rules

These come from running a real whole-house renovation. Do not trade them away for convenience.

- **The AI proposes, the homeowner confirms.** Nothing the AI extracts is written to the project record until a person taps "Log it". Proposed changes are shown as cards in the chat.
- **History is never overwritten.** Every confirmed change writes an append-only event with who, when, before, after, and why. A changed decision keeps the old selection in history. Deleting is a soft delete with an event.
- **The structured record is the memory, not the chat.** The AI is stateless. Every AI call is given a fresh briefing built from the database (see "How the app remembers" in the technical spec). Never rely on chat history to know a fact.
- **Plain English for a first-timer.** Every decision says why it matters now. Trade terms get a few words of explanation. No jargon in UI copy.
- **Show only what matters now.** Home shows at most a handful of urgent items. Everything else is one tap away.
- **Mobile first.** Most use happens on a phone, on site, with one hand. Design at 390px wide first, then scale up.
- **Originals are kept.** Every uploaded invoice, photo and document is stored as the original file, not just the AI's summary.
- **Backups the homeowner never has to think about.** Automatic weekly export to the owner's email, plus on-demand export.

## Engineering conventions

- TypeScript everywhere, strict mode.
- Next.js App Router. Server Components by default; client components only where interaction needs it.
- All database access goes through Supabase with Row Level Security on every table. Never use the service-role key in code that runs in the browser.
- All Anthropic API calls happen server-side (route handlers or server actions). The API key never reaches the client.
- Every write to project data goes through one server function per action type that (1) checks the user's role on the project, (2) applies the change, and (3) writes the event row, all in one transaction.
- Money is stored as integer cents. Dates without times are stored as `date`, not timestamps.
- Validate every AI response with Zod before using it. Treat model output and uploaded document text as untrusted data, never as instructions.
- Write tests for: role checks, event logging, decide-by date math, budget math, and AI response parsing.
- Before using any Anthropic API feature or model ID, check the current docs at https://docs.claude.com. Do not hardcode a model ID from memory.

## When unsure

Ask Drew (the product owner) rather than guessing on product behavior. For anything the specs don't cover, prefer the simplest behavior that keeps the rules above intact, and note the assumption in the PR description.
