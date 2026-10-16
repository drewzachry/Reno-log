# Sample project: Rivera renovation

Loaded from **Menu → Load the sample project** (or the start screen). It's built from the
decision library in `AI_BEHAVIOR.md`: a kitchen, a primary bath and a hall bath, plus
whole-house items. Defined in `supabase/migrations/20261017000000_record.sql`
(`load_sample_project`), mirrored in `src/lib/record/sample.fixture.ts` for tests; the accounts were added in
`20261018000000_funding_sources.sql`, which replaces the function. Change
both together, and this page.

Dates are relative to the day it's loaded ("T"), so Up next always has something in it.

## Schedule

| Milestone | Date |
|---|---|
| Rough-in | T + 24 days |
| Walls close | T + 52 |
| Cabinets in | T + 80 |
| Countertops templated | T + 101 |
| Finish work | T + 122 |
| Move-in | T + 165 |

## Decisions: 32, 12 made

| Group | Count |
|---|---|
| Overdue | 3: Tub (Primary bath, 18 days late), Range hood (Kitchen, 4), Shower valve (Hall bath, 4) |
| Next 3 weeks | 6 |
| Later | 11 |
| Made | 12 |

By stage: 13 before rough-in, 4 before walls close, 4 before cabinets, 2 before countertops,
8 before finish work, 1 before move-in. By room: Hall bath 5, Kitchen 8, Primary bath 9,
Whole house 10.

**Moving rough-in moves 13 deadlines** (every rough-in decision; 9 of them still open), and
History records it as one event with the old and new date.

## Budget

| Bucket | Kind | Budget | Counts against it | Left |
|---|---|---|---|---|
| Construction contract | In the contract | $285,000 | $71,250 paid | $213,750 |
| Tile allowance | Allowance | $8,000 | $9,250 chosen ($1,950 paid) | **over by $1,250** |
| Plumbing fixtures allowance | Allowance | $9,500 | $6,890 chosen | $2,610 |
| Lighting allowance | Allowance | $4,000 | $0 | $4,000 |
| Appliances | You buy directly | $14,000 | $4,000 paid | $10,000 |
| Cushion | Cushion | $28,500 | $2,400 approved change order | $26,100 |

**Totals:** $349,000 budget, $77,200 paid so far, $26,100 cushion left, $16,950 buffer.

## Money for the project

| Account | Amount |
|---|---|
| Savings | $90,000 |
| Home equity line of credit | $200,000 |

**Buffer:** $290,000 set aside − $273,050 still to pay = **$16,950**.

Still to pay, by line: contract $213,750, tile $7,300 ($9,250 chosen − $1,950 paid),
plumbing $9,500, lighting $4,000, appliances $10,000, cushion $28,500.

Ledger: two Bayside Builders invoices ($28,500 deposit, $42,750 progress payment), a $4,000
appliance deposit, a $1,950 tile deposit, an approved $2,400 change order (move the kitchen
window) and a proposed $650 one (blocking for a floating vanity), which doesn't count until
approved.

## Up next (first four)

1. Now: Tile allowance is $1,250 over budget
2. 18 days late: Decide the tub (Primary bath)
3. 4 days late: Decide the range hood (Kitchen)
4. 4 days late: Decide the shower valve (Hall bath)

Then "Place the order: Kitchen sink and faucet", decided but not ordered past its deadline.

## How the math works

- **Decide by** = the decision's own due date if set, otherwise milestone date − lead weeks.
- **Allowances** count chosen items (Decided or further) as soon as they're picked: used is
  the larger of money out and chosen cost. Other buckets count money out only.
- **Still to pay** = for each budget line, its full budget (or what's actually used, if
  that's more) minus what's been paid. The cushion counts in full, so the buffer is cautious.
- **Buffer** = money set aside (accounts the owner types in; not linked to a bank) − still to
  pay. When it's negative, Up next says how much is missing.
- **Money out** = invoices + payments − credits, plus approved change orders. Proposed and
  rejected change orders don't count. (Assumption: invoices and payments are separate costs,
  not an invoice and the payment of that same invoice.)
