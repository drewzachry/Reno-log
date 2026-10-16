// A scripted stand-in for the Claude Messages API, for end-to-end tests only.
// It reads the newest message and the project briefing the app sent, and
// answers like the assistant would for the Phase 3 acceptance cases.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The last request, so tests can check what the app sent (briefing, images). */
export let lastRequest = null;

function briefingOf(body) {
  const sys = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : body.system;
  return sys ?? "";
}

/** "id | room | title | ..." rows from the briefing. */
function row(briefing, room, title) {
  return briefing
    .split("\n")
    .map((l) => l.split(" | "))
    .find((c) => c[1] === room && c[2] === title)?.[0];
}
function bucket(briefing, name) {
  return briefing
    .split("\n")
    .map((l) => l.split(" | "))
    .find(
      (c) => c[1] === name && ["contract", "allowance", "owner", "contingency"].includes(c[2]),
    )?.[0];
}

export function fakeClaude(body) {
  lastRequest = body;
  const briefing = briefingOf(body);
  const today = briefing.match(/^Today: .*\((\d{4}-\d{2}-\d{2})\)$/m)?.[1] ?? "2026-01-01";
  const last = body.messages.at(-1);
  const blocks =
    typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content;
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const images = blocks.filter((b) => b.type === "image").length;

  let reply = "Got it.";
  const tools = [];
  const date = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b/i,
  );

  if (/drywall/i.test(text) && date) {
    const m = MONTHS.indexOf(date[1].toLowerCase()) + 1;
    let year = Number(today.slice(0, 4));
    const iso = (y) => `${y}-${String(m).padStart(2, "0")}-${String(date[2]).padStart(2, "0")}`;
    if (iso(year) < today) year++;
    reply = "Thanks for the update. Moving drywall changes when some decisions are due.";
    tools.push({
      name: "move_milestone",
      input: { milestone_key: "drywall", date: iso(year), reason: "Contractor's update" },
    });
  } else if (images && /invoice/i.test(text)) {
    reply = "That's Rivera Plumbing's rough-in invoice for $2,400. Here's a card for it.";
    tools.push({
      name: "log_invoice",
      input: {
        vendor: "Rivera Plumbing",
        date: today,
        amount_cents: 240000,
        bucket_id: bucket(briefing, "Plumbing fixtures allowance") ?? null,
        description: "Rough-in plumbing, second draw",
        kind: "invoice",
        image_index: 0,
        flags: [],
      },
    });
  } else if (images && /tile|sample/i.test(text)) {
    reply = "Nice pick. I've set it as the primary bath shower tile.";
    tools.push({
      name: "update_decision",
      input: {
        decision_id: row(briefing, "Primary bath", "Shower wall tile"),
        status: "decided",
        selection: "White zellige 2x6",
        cost_cents: 410000,
        note: "Picked from a sample",
      },
    });
  } else if (/brushed nickel/i.test(text) && /\bwant\b/i.test(text)) {
    reply = "Good to know. I'll keep that in mind for every fixture.";
    tools.push({
      name: "remember_fact",
      input: { fact: "Wants brushed nickel fixtures everywhere", category: "preference" },
    });
  } else if (/faucet|towel bar|hardware|finish/i.test(text)) {
    const facts = briefing.slice(briefing.indexOf("## Remembered facts"));
    reply = /brushed nickel/i.test(facts)
      ? "Go with brushed nickel, to match the rest of the house."
      : "Any finish works; pick one and use it throughout.";
  }

  return {
    id: `msg_test_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content: [
      { type: "text", text: reply },
      ...tools.map((t, i) => ({
        type: "tool_use",
        id: `toolu_test_${i}`,
        name: t.name,
        input: t.input,
      })),
    ],
    stop_reason: tools.length ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 80,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}
