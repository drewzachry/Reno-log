/** A message from earlier in the chat, with the cards it proposed. */
export type PastMessage = {
  role: "user" | "assistant";
  text: string;
  author: string | null;
  fileCount: number;
  cards: { kind_label: string; summary: string; state: string }[];
};

const STATE = { pending: "waiting", confirmed: "logged", dismissed: "skipped", failed: "failed" };

/**
 * Earlier messages as alternating user/assistant turns, for conversational
 * flow only (facts come from the briefing). Starts with a user turn; runs of
 * the same role are merged.
 */
export function pastTurns(messages: PastMessage[]) {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    let text = m.text.trim();
    if (m.role === "user") {
      if (m.author) text = `${m.author}: ${text}`;
      if (m.fileCount) text += ` (attached ${m.fileCount} photo${m.fileCount === 1 ? "" : "s"})`;
    } else if (m.cards.length) {
      text += `\n[Cards: ${m.cards
        .map(
          (c) =>
            `${c.kind_label}: ${c.summary} (${STATE[c.state as keyof typeof STATE] ?? c.state})`,
        )
        .join("; ")}]`;
    }
    if (!text.trim()) continue;
    const last = turns.at(-1);
    if (last?.role === m.role) last.content += `\n\n${text}`;
    else if (turns.length || m.role === "user") turns.push({ role: m.role, content: text });
  }
  return turns;
}
