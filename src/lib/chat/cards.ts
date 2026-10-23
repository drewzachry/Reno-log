import { bucketStats } from "@/lib/record/budget";
import { daysBetween, shortDate } from "@/lib/record/dates";
import { decideBy, milestoneDates, type DecisionWithDeadline } from "@/lib/record/deadlines";
import { money } from "@/lib/record/money";
import {
  CHOSEN,
  OPEN,
  STATUS_LABEL,
  type Bucket,
  type Decision,
  type ISODate,
  type LedgerEntry,
  type Milestone,
  type Status,
} from "@/lib/record/types";
import type { ToolCall, ToolName } from "./tools";

/** What a card needs to know about the project. */
export type CardContext = {
  today: ISODate;
  milestones: Milestone[];
  buckets: Bucket[];
  ledger: LedgerEntry[];
  decisions: DecisionWithDeadline[];
  facts: { fact: string }[];
  /** File ids of the images attached to the newest message, in order. */
  imageFileIds: string[];
};

/** A proposal ready to store: the payload confirm_proposal applies, and what the card shows. */
export type Card = {
  type: ToolName;
  payload: Record<string, unknown>;
  kind_label: string;
  summary: string;
  detail: string | null;
  warnings: string[];
};

const lines = (...xs: (string | null | undefined | false)[]) =>
  xs.filter(Boolean).join("\n") || null;

const sameText = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/** "Puts Tile allowance over by $1,250" when a change takes a budget line past its budget. */
function budgetWarning(
  bucket: Bucket,
  ledgerAfter: LedgerEntry[],
  decisionsAfter: Decision[],
  ctx: CardContext,
): string | null {
  const before = bucketStats(bucket, ctx.ledger, ctx.decisions).left;
  const after = bucketStats(bucket, ledgerAfter, decisionsAfter).left;
  if (after >= 0 || after >= before) return null;
  return before >= 0
    ? `Puts ${bucket.name} over by ${money(-after)}`
    : `${bucket.name} would be ${money(-after)} over (now ${money(-before)})`;
}

function entry(partial: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "proposed",
    kind: "invoice",
    date: "",
    vendor: "",
    description: null,
    amount_cents: 0,
    bucket_id: null,
    flags: [],
    change_order_status: null,
    unpaid: false,
    ...partial,
  };
}

/** A recent ledger entry with the same amount from what looks like the same vendor. */
function duplicateOf(vendor: string, amount: number, ctx: CardContext) {
  const word = vendor.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return ctx.ledger.find(
    (l) =>
      l.kind !== "change_order" &&
      l.amount_cents === amount &&
      Math.abs(daysBetween(ctx.today, l.date)) <= 120 &&
      word.length > 1 &&
      l.vendor.toLowerCase().includes(word),
  );
}

const knownBucket = (id: string | null, ctx: CardContext) =>
  (id && ctx.buckets.find((b) => b.id === id)) || null;

/**
 * Turns a validated tool call into a card, checking every id against the
 * record. Returns null when the proposal can't apply (an unknown decision, a
 * photo that wasn't attached, nothing to change); the assistant's reply still
 * shows, just without that card.
 */
export function buildCard(call: ToolCall, ctx: CardContext): Card | null {
  switch (call.name) {
    case "log_invoice": {
      const p = call.input;
      const bucket = knownBucket(p.bucket_id, ctx);
      const fileId = p.image_index == null ? null : (ctx.imageFileIds[p.image_index] ?? null);
      const date = p.date ?? ctx.today;
      const label = { invoice: "Invoice", payment: "Payment", credit: "Credit" }[p.kind];
      const warnings: string[] = [];
      const dup = p.kind !== "credit" && duplicateOf(p.vendor, p.amount_cents, ctx);
      if (dup)
        warnings.push(
          p.kind === "payment" && dup.kind === "invoice" && dup.unpaid
            ? `Matches the unpaid invoice from ${dup.vendor} on ${shortDate(dup.date)}: mark that one paid instead?`
            : `Same amount as ${dup.vendor} on ${shortDate(dup.date)}: a duplicate?`,
        );
      const unpaid = p.kind === "invoice" && !p.paid;
      const over =
        bucket &&
        p.kind !== "credit" &&
        budgetWarning(
          bucket,
          [
            ...ctx.ledger,
            entry({
              kind: p.kind,
              amount_cents: p.amount_cents,
              bucket_id: bucket.id,
              date,
              unpaid,
            }),
          ],
          ctx.decisions,
          ctx,
        );
      if (over) warnings.push(over);
      for (const f of p.flags) {
        if (dup && /duplicate/i.test(f)) continue;
        if (over && /over (the )?budget|over by/i.test(f)) continue;
        warnings.push(f);
      }
      return {
        type: "log_invoice",
        payload: {
          kind: p.kind,
          unpaid,
          vendor: p.vendor,
          date,
          amount_cents: p.amount_cents,
          description: p.description.trim() || null,
          bucket_id: bucket?.id ?? null,
          file_id: fileId,
          flags: p.flags,
        },
        kind_label: label,
        summary: `${p.vendor} · ${money(p.amount_cents)}`,
        detail: lines(
          p.description.trim(),
          `${shortDate(date)} · ${bucket ? bucket.name : "No budget line yet"}${unpaid ? " · Not paid yet" : ""}`,
        ),
        warnings,
      };
    }

    case "log_change_order": {
      const p = call.input;
      const bucket = knownBucket(p.bucket_id, ctx);
      const fileId = p.image_index == null ? null : (ctx.imageFileIds[p.image_index] ?? null);
      const warnings: string[] = [];
      if (bucket && p.status === "approved") {
        const over = budgetWarning(
          bucket,
          [
            ...ctx.ledger,
            entry({
              kind: "change_order",
              change_order_status: "approved",
              amount_cents: p.amount_cents,
              bucket_id: bucket.id,
              date: ctx.today,
            }),
          ],
          ctx.decisions,
          ctx,
        );
        if (over) warnings.push(over);
      }
      if (p.status === "proposed")
        warnings.push("Not agreed yet: get the price in writing before work starts");
      return {
        type: "log_change_order",
        payload: {
          vendor: p.vendor ?? "Contractor",
          date: ctx.today,
          amount_cents: p.amount_cents,
          description: p.reason ? `${p.description} (${p.reason})` : p.description,
          bucket_id: bucket?.id ?? null,
          file_id: fileId,
          status: p.status,
        },
        kind_label: "Change order",
        summary: `${p.description} · ${money(p.amount_cents)}`,
        detail: lines(
          `${p.status === "approved" ? "Agreed" : "Proposed"}${p.vendor ? ` · ${p.vendor}` : ""} · ${bucket ? bucket.name : "No budget line yet"}`,
          p.reason,
        ),
        warnings,
      };
    }

    case "update_decision": {
      const p = call.input;
      const d = ctx.decisions.find((x) => x.id === p.decision_id);
      if (!d) return null;
      const changes: Record<string, unknown> = {};
      if (p.status && p.status !== d.status) changes.status = p.status;
      if (p.selection && !sameText(p.selection, d.selection ?? "")) changes.selection = p.selection;
      if (p.cost_cents != null && p.cost_cents !== d.cost_cents) changes.cost_cents = p.cost_cents;
      if (!Object.keys(changes).length) return null;

      const warnings: string[] = [];
      const bucket = knownBucket(d.bucket_id, ctx);
      if (bucket) {
        const after: Decision = {
          ...d,
          status: (changes.status as Status) ?? d.status,
          cost_cents: (changes.cost_cents as number) ?? d.cost_cents,
        };
        const over = budgetWarning(
          bucket,
          ctx.ledger,
          ctx.decisions.map((x) => (x.id === d.id ? after : x)),
          ctx,
        );
        if (over) warnings.push(over);
      }
      const replaces =
        changes.selection && d.selection && CHOSEN.has(d.status) ? d.selection : null;
      return {
        type: "update_decision",
        payload: { decision_id: d.id, changes, note: p.note },
        kind_label: "Decision",
        summary: `${d.title} (${d.room})`,
        detail: lines(
          [
            changes.status &&
              `${STATUS_LABEL[d.status]} → ${STATUS_LABEL[changes.status as Status]}`,
            changes.selection as string | undefined,
            changes.cost_cents != null && money(changes.cost_cents as number),
          ]
            .filter(Boolean)
            .join(" · "),
          replaces && `Replaces earlier pick: ${replaces}`,
        ),
        warnings,
      };
    }

    case "add_decision": {
      const p = call.input;
      const bucket = knownBucket(p.bucket_id, ctx);
      const by = decideBy(
        { due_date_override: null, milestone_key: p.milestone_key, lead_weeks: p.lead_weeks },
        milestoneDates(ctx.milestones),
      );
      const same = ctx.decisions.find(
        (d) => sameText(d.title, p.title) && sameText(d.room, p.room),
      );
      const warnings = same ? [`You already have “${same.title}” for ${same.room}`] : [];
      const stage = ctx.milestones.find((m) => m.key === p.milestone_key)?.label ?? p.milestone_key;
      return {
        type: "add_decision",
        payload: {
          title: p.title,
          room: p.room,
          category: p.category,
          milestone_key: p.milestone_key,
          lead_weeks: p.lead_weeks,
          why: p.why.trim() || null,
          bucket_id: bucket?.id ?? null,
        },
        kind_label: "New decision",
        summary: `${p.title} (${p.room})`,
        detail: lines(
          by
            ? `Decide by ${shortDate(by)}${p.lead_weeks ? `, ${p.lead_weeks} wk before ${stage}` : `, before ${stage}`}`
            : `Before ${stage}`,
          p.why.trim(),
        ),
        warnings,
      };
    }

    case "move_milestone": {
      const p = call.input;
      const m = ctx.milestones.find((x) => x.key === p.milestone_key);
      if (!m || m.date === p.date) return null;
      const dependent = ctx.decisions.filter(
        (d) => d.milestone_key === m.key && !d.due_date_override,
      );
      const open = dependent.filter((d) => OPEN.has(d.status)).length;
      const warnings: string[] = [];
      if (daysBetween(ctx.today, p.date) < 0) warnings.push("That date has already passed");
      return {
        type: "move_milestone",
        payload: { milestone_key: m.key, date: p.date, reason: p.reason },
        kind_label: "Schedule change",
        summary: `${m.label}: ${m.date ? `${shortDate(m.date)} → ` : ""}${shortDate(p.date)}`,
        detail: lines(
          dependent.length
            ? `Moves ${dependent.length} deadline${dependent.length === 1 ? "" : "s"}${open ? `, ${open} still to decide` : ""}`
            : "No deadlines depend on it yet",
          p.reason,
        ),
        warnings,
      };
    }

    case "add_photo": {
      const p = call.input;
      const fileId = ctx.imageFileIds[p.image_index];
      if (!fileId) return null;
      const d = p.decision_id ? ctx.decisions.find((x) => x.id === p.decision_id) : undefined;
      return {
        type: "add_photo",
        payload: { file_id: fileId, room: p.room, caption: p.caption, decision_id: d?.id ?? null },
        kind_label: "Photo",
        summary: p.caption,
        detail: lines([p.room, d && `For ${d.title}`].filter(Boolean).join(" · ")),
        warnings: [],
      };
    }

    case "remember_fact": {
      const p = call.input;
      if (ctx.facts.some((f) => sameText(f.fact, p.fact))) return null;
      return {
        type: "remember_fact",
        payload: { fact: p.fact, category: p.category },
        kind_label: "Remember",
        summary: p.fact,
        detail: "I'll keep this in mind in every answer. You can forget it in Settings.",
        warnings: [],
      };
    }

    case "add_note": {
      const p = call.input;
      return {
        type: "add_note",
        payload: { text: p.text, room: p.room },
        kind_label: "Note",
        summary: p.text,
        detail: p.room,
        warnings: [],
      };
    }
  }
}
