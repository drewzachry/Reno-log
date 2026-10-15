# Product spec: Reno Logbook

## The problem

A homeowner doing a major renovation for the first time has to make hundreds of decisions, track a budget split across contract, allowances and change orders, follow a schedule that keeps moving, and keep paperwork from an architect, a GC, a designer and a dozen suppliers. They don't know what decisions are coming, so they find out about deadlines when a tradesperson is standing in the room waiting. They lose money on allowance overages they didn't see coming, duplicate invoices, and changes nobody wrote down.

## Who it is for

- **Primary:** a homeowner with little or no renovation experience, managing a project run by a general contractor. Uses a phone on site and a laptop at night.
- **Collaborator:** a spouse or partner who wants to see status, weigh in on choices and add updates, without setting anything up.
- **Later, not in v1:** the contractor or designer as a read-only or limited participant.

## The promise

"Tell it what happened. It keeps the record, tells you what to decide next, and catches money problems before they cost you."

## Core loop

1. The homeowner drops something into the chat: a text update ("GC says cabinets slip two weeks"), a photo of an invoice, a photo of a tile sample, a document, a question.
2. The AI interprets it and replies in plain English, with one or more **proposal cards** ("Log this? Invoice from ABC Electric, $4,200, rough-in progress payment, counts against the contract").
3. The homeowner taps **Log it** or **Not now** on each card. They can also correct it in the chat ("no, it was $4,000"), and the AI proposes a corrected card.
4. On confirm, the change is written to the record with an event in History, and the app shows the ripple effects ("That pushes countertop templating; slab choice is now due Nov 10").

## Screens

Phone layout uses a bottom tab bar. Desktop shows the chat on the left and the selected tab on the right. The prototype has the reference layout and copy.

### Chat (home on phones)

- **Up next** strip at the top: the 2–4 most urgent items. These are overdue decisions, decisions due within 21 days, decisions made but not ordered past their deadline, buckets over budget, and cards waiting for confirmation.
- Message list with proposal cards inline. Card states: pending (highlighted), logged, skipped.
- Composer with text, camera/photo picker, document attach, and suggested prompts ("What should I be deciding now?").
- Messages show who sent them when there are collaborators ("Kate: picked the hex tile").

### Decisions

- Every decision the project needs, with title, room, category, plain-English "why it matters now", decide-by date, lead time, status, selection, cost, linked allowance and source document.
- Group by **deadline** (Overdue, Next 3 weeks, Later, Made), by **room**, or by **stage** (before rough-in, before walls close, and so on). Each stage has a one-line plain-English explanation.
- Statuses: Not started → Exploring → Decided → Ordered → Delivered → Installed. "Decided" is not done; the app nags about decided-but-not-ordered items with long lead times.
- Each decision opens to a detail view with its full history, options considered, photos, linked documents and comments.
- Optional in v1.1: "options" on a decision (candidates with photo, price and link) so a couple can compare before deciding.

### Schedule

- Six milestones: Rough-in, Walls close (drywall), Cabinets in, Countertops templated, Finish work, Move-in. Each has a plain-English explanation and a count of open decisions tied to it.
- Decision deadlines are computed: `milestone date − lead time`. When a milestone moves, every dependent deadline moves with it, and the app says which ones got tighter.
- v1.1: custom milestones and a simple timeline view.

### Budget

- Buckets by kind: **In the contract**, **Allowances**, **You buy directly**, **Cushion** (contingency).
- Allowances count chosen items as committed the moment a selection is made, so an overage shows before the invoice arrives.
- Totals: total budget, paid so far, cushion left.
- Ledger of invoices, payments and change orders, each with the original file attached and any flags (possible duplicate, over budget, looks like extra work not in the contract, payment ahead of work).
- Change orders are first-class: description, amount, which bucket they draw from, approved yes/no, and a link to the document.

### Photos

- Progress photos and sample photos, filed by room and date, optionally linked to a decision.
- Prompt the homeowner to photograph every open wall before drywall.

### Documents

- Uploaded plans, contracts, specs, estimates and permits. Each shows a summary and "what it says" key points with page numbers, plus a link to the original.
- The chat answers questions from these documents and cites the document and page.

### History

- Every confirmed change, newest first, with who made it, when, before and after, and why. Filter by type (decisions, money, schedule, documents) and by person.

### Project settings

- Project name, address, scope.
- **People:** invite a collaborator by email, see who has access and their role, change role, remove someone, revoke a pending invite.
- Backups: weekly email export on/off, export now.
- Start a new project. A user can have several projects; switching between them is in the header menu.

## Onboarding (new project)

1. **Documents first (optional but encouraged):** drop in the contract, plans, specs, estimates. Each is read on the spot with a progress line ("Reading page 12 of 24", "Looking at drawing page 3").
2. **A few questions:** project name, what you're renovating, start date, target move-in, contract price, cushion, allowances. Fields prefill from the documents where possible.
3. **Build my decision map:** the AI combines the answers, the documents and the decision library into milestones, budget buckets and 25–70 decisions. Decisions the plans already settle start as "Decided" with the source noted. Anything the contract excludes or leaves to the owner becomes a decision.
4. Land on the Decisions tab with a chat message explaining what was built and that the dates are estimates until the GC confirms them.

## Collaborators

- The project owner invites people by email from Project settings.
- Roles:
  - **Owner:** everything, including deleting the project, managing people and billing.
  - **Editor** (default for a spouse): chat, confirm cards, edit decisions and budget, upload, invite others as Editor or Viewer.
  - **Viewer:** read everything and comment, can chat to ask questions, cannot confirm cards or change the record.
- The invite email contains a link. The invitee signs in or creates an account with the same email and lands in the project. Invites expire after 14 days and can be revoked.
- Everyone sees the same record live. Cards proposed from one person's message can be confirmed by any Editor; History records who confirmed.
- Notifications (v1.1): "Kate logged an invoice", "Decision due in 3 days". Email digest by default; push notifications once installed as an app.

## Out of scope for v1

Contractor portal, payments, scheduling the trades, bidding, native app store apps (the web app is installable as a PWA), multi-language.

## Success looks like

- A first-time homeowner can set up a project from their contract and plans in under 15 minutes.
- No decision deadline passes without at least two warnings.
- The homeowner can answer "how much have we spent and how much is left in each allowance" in under 10 seconds on their phone.
- A spouse can be invited and see the project in under two minutes.
