// A scripted stand-in for the Claude Messages API, for end-to-end tests only.
// It reads the newest message and the project briefing the app sent, and
// answers like the assistant would for the Phase 3 acceptance cases.

import { extractText, getDocumentProxy } from "unpdf";

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

const textReply = (body, text, stop = "end_turn") => ({
  id: `msg_test_${Date.now()}`,
  type: "message",
  role: "assistant",
  model: body.model,
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: {
    input_tokens: 3000,
    output_tokens: 400,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
});

const topicOf = (t) =>
  /exclu/i.test(t)
    ? "Exclusions"
    : /owner to (select|supply)/i.test(t)
      ? "Owner responsibilities"
      : /\$\d/.test(t)
        ? "Price & payments"
        : /shower|tile|fixture|vanity/i.test(t)
          ? "Fixtures & finishes"
          : "Other";

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dollarsToCents = (t) => Math.round(Number(t.replace(/[$,]/g, "")) * 100);

/** Project setup, step 1: dates, budget lines and rooms from the answers. */
function fakeSkeleton(note) {
  const get = (label) => note.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1] ?? "";
  const scope = get("What they're renovating");
  const start = get("Construction start");
  const moveIn = /^\d{4}-/.test(get("Target move-in"))
    ? get("Target move-in")
    : addDays(start, 170);
  const contract = get("Contract price").match(/\$[\d,]+/)?.[0];
  const cushion = get("Cushion set aside").match(/\$[\d,]+/)?.[0];
  const allowances = [...get("Allowances").matchAll(/([A-Za-z][A-Za-z ]*?) \$([\d,]+)/g)].map(
    (m) => ({
      name: m[1].trim(),
      cents: dollarsToCents(m[2]),
    }),
  );
  const buckets = [];
  if (contract)
    buckets.push({
      key: "contract",
      name: "Construction contract",
      kind: "contract",
      budget_cents: dollarsToCents(contract),
    });
  for (const a of allowances)
    buckets.push({
      key: a.name.toLowerCase().split(" ")[0],
      name: `${a.name[0].toUpperCase()}${a.name.slice(1)} allowance`,
      kind: "allowance",
      budget_cents: a.cents,
    });
  if (contract || cushion)
    buckets.push({
      key: "cushion",
      name: "Cushion",
      kind: "contingency",
      budget_cents: cushion ? dollarsToCents(cushion) : Math.round(dollarsToCents(contract) / 10),
    });
  const rooms = [...scope.matchAll(/\b(primary|hall|guest|kids) bath/gi)].map((m) => ({
    name: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} bath`,
    area: "bath",
  }));
  if (/kitchen/i.test(scope)) rooms.push({ name: "Kitchen", area: "kitchen" });
  return {
    scope,
    milestones: {
      rough_in: addDays(start, 28),
      drywall: addDays(start, 56),
      cabinets: addDays(start, 84),
      countertops: addDays(start, 105),
      finish: addDays(start, 126),
      move_in: moveIn,
    },
    buckets,
    rooms,
  };
}

/** Project setup, step 2: what the documents decide, and allowance links, by number. */
function fakeDetails(note) {
  const listed = (
    note.match(/<listed_decisions[^>]*>\n([\s\S]*?)\n<\/listed_decisions>/)?.[1] ?? ""
  )
    .split("\n")
    .map((l) => {
      const m = l.match(/^(\d+)\. (.*?) \| (.*?) \| (.*)$/);
      return m && { n: Number(m[1]), title: m[2], room: m[3], category: m[4] };
    })
    .filter(Boolean);
  const keys = [...note.matchAll(/^(\w+): .*\(allowance,/gm)].map((m) => m[1]);
  const docs = note.match(/<documents>\n([\s\S]*?)\n<\/documents>/)?.[1] ?? "";
  const docTitle = (at) =>
    docs
      .slice(0, at)
      .match(/### (.*?) \(/g)
      ?.at(-1)
      ?.slice(4, -2) ?? "Document";
  const picks = [...docs.matchAll(/Selected: (.*?) = (.*?)\.(?: \(p\.(\d+)\))?$/gm)];
  return {
    skip: [],
    decided: picks
      .map((m) => {
        const d = listed.find((x) => x.title === m[1]);
        return d && { n: d.n, selection: m[2], source: `${docTitle(m.index)} p.${m[3]}` };
      })
      .filter(Boolean),
    links: listed
      .map((d) => {
        const key = keys.find((k) => d.category.toLowerCase().includes(k));
        return key && { n: d.n, bucket_key: key };
      })
      .filter(Boolean),
    extra: [],
  };
}

/** Document reading (structured output): "reads" the real text of what it's sent. */
async function fakeReader(body) {
  const blocks = body.messages.at(-1).content;
  const note = blocks.find((b) => b.type === "text")?.text ?? "";
  if (/<listed_decisions/.test(note)) return fakeDetails(note);
  if (/<homeowner_answers>/.test(note)) return fakeSkeleton(note);
  if (/<facts_found>/.test(note)) {
    const facts = [...note.matchAll(/^- \[([^\]]+)\] (.*?)(?: \(p\.(\d+)\))?$/gm)].map((m) => ({
      topic: m[1],
      detail: m[2],
      page: m[3] ? Number(m[3]) : null,
    }));
    const all = note.toLowerCase();
    const list = (note.match(/<decision_list[^>]*>\n([\s\S]*?)\n<\/decision_list>/)?.[1] ?? "")
      .toLowerCase()
      .split("\n");
    const owner = facts.filter((f) => /owner to select/i.test(f.detail));
    const fresh = owner
      .map((f) => {
        const m = f.detail.match(/owner to select:? (.*?) \((.*?)\)/i);
        return m && { title: m[1], room: m[2], page: f.page };
      })
      .filter((d) => d && !list.some((l) => l.startsWith(d.title.toLowerCase())));
    const price = all.match(/contract price:? \$([\d,]+)/);
    const name = note.match(/^File name: (.*)$/m)?.[1] ?? "Document";
    const isContract = /contract/.test(all);
    return {
      kind: isContract ? "contract" : /sheet|plan/.test(all) ? "plans" : "other",
      title: isContract ? "Construction contract" : name.replace(/\.[a-z]+$/i, ""),
      summary: isContract
        ? "Your agreement with the builder: the price, what's included and what isn't."
        : "A project document.",
      facts: facts.slice(0, 40),
      contract_price_cents: price ? Number(price[1].replace(/,/g, "")) * 100 : null,
      allowances: facts
        .map((f) => f.detail.match(/^Allowance: (.*?) \$([\d,]+)/))
        .filter(Boolean)
        .map((m) => ({ name: m[1], amount_cents: dollarsToCents(m[2]) })),
      start_date: null,
      completion_date: all.match(/completion date:? (\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
      decisions_named: owner.length,
      new_decisions: fresh.map((d) => ({
        title: d.title,
        room: d.room,
        category: null,
        milestone_key: "rough_in",
        lead_weeks: 2,
        why: "The contract leaves this choice to you.",
        page: d.page,
      })),
    };
  }

  const first = Number(note.match(/first page is page (\d+)/)?.[1] ?? 1);
  let pages = [];
  const doc = blocks.find((b) => b.type === "document");
  if (doc) {
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(doc.source.data, "base64")));
    pages = (await extractText(pdf, { mergePages: false })).text.map((t, i) => ({
      page: first + i,
      text: t.replace(/\s+/g, " ").trim(),
    }));
  } else if (blocks.some((b) => b.type === "image")) {
    pages = [{ page: 1, text: "A photo of a page." }];
  } else {
    const t = note.match(/<document_text[^>]*>\n([\s\S]*?)\n<\/document_text>/)?.[1] ?? "";
    pages = [{ page: null, text: t.replace(/\s+/g, " ").trim() }];
  }
  return {
    pages: pages
      .filter((p) => p.page != null)
      .map((p) => ({ page: p.page, description: `Text page: ${p.text.slice(0, 80)}` })),
    facts: pages.flatMap((p) =>
      p.text
        .split(/(?<=\.)\s+/)
        .filter((x) => x.includes(":"))
        .map((detail) => ({ topic: topicOf(detail), detail, page: p.page })),
    ),
  };
}

export async function fakeClaude(body) {
  lastRequest = body;
  if (body.output_config?.format) {
    return textReply(body, JSON.stringify(await fakeReader(body)));
  }
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
        paid: false,
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
  } else if (/Attached documents, now being read/.test(text)) {
    reply = "I'm reading that now and will post a summary here when it's done.";
  } else if (/<document_excerpts>/.test(text) && /exclu|shower|size/i.test(text)) {
    const ex = text.slice(text.indexOf("<document_excerpts>"));
    const want = /exclu/i.test(text.split("<document_excerpts>")[0]) ? /exclu/i : /shower/i;
    const hit = [...ex.matchAll(/^\[(.*?)\]\n(.*)$/gm)].find((m) => want.test(m[2]));
    reply = hit
      ? `${hit[2].split(/(?<=\.)\s+/).find((x) => want.test(x))} (${hit[1]})`
      : "Your documents don't say. Ask your contractor.";
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

/** The same message as server-sent events, for streaming requests. */
export function toEvents(msg) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let out = ev("message_start", {
    message: { ...msg, content: [], stop_reason: null, usage: { ...msg.usage, output_tokens: 0 } },
  });
  msg.content.forEach((b, index) => {
    if (b.type === "text") {
      out += ev("content_block_start", { index, content_block: { type: "text", text: "" } });
      out += ev("content_block_delta", { index, delta: { type: "text_delta", text: b.text } });
    } else {
      out += ev("content_block_start", { index, content_block: { ...b, input: {} } });
      out += ev("content_block_delta", {
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) },
      });
    }
    out += ev("content_block_stop", { index });
  });
  out += ev("message_delta", {
    delta: { stop_reason: msg.stop_reason, stop_sequence: null },
    usage: { output_tokens: msg.usage.output_tokens },
  });
  out += ev("message_stop", {});
  return out;
}
