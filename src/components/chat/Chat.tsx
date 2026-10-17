"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DOCUMENT_ACCEPT, uploadToProject, type Uploaded } from "@/lib/upload";
import { ProposalCard, type CardData } from "./ProposalCard";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Sent by the person looking. */
  mine: boolean;
  /** Someone else's name, for messages from collaborators. */
  author: string | null;
  images: string[];
  /** Names of attached documents (PDFs and the like), which go to the document reader. */
  documents: string[];
  cards: (CardData & { created_at: string })[];
};

const WELCOME =
  "Hi! I keep your renovation organized. Tell me what happened on site, forward what your contractor said, or snap a photo of an invoice, a receipt or a tile sample. I’ll suggest how to log it, and nothing is saved until you tap Log it.";
const WELCOME_VIEWER =
  "Hi! Ask me anything about this renovation: what’s due, what’s been decided, where the money stands.";
const MAX_PHOTOS = 8;
/** Opening the app shows Up next and the latest few messages; older ones are a tap away. */
const RECENT = 10;

type Draft = { file: File; url: string };
const isImage = (f: File) => f.type.startsWith("image/");

export function Chat({
  projectId,
  canEdit,
  messages,
  suggestions,
}: {
  projectId: string;
  canEdit: boolean;
  messages: ChatMessage[];
  suggestions: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState<{ text: string; images: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const seen = useRef(messages.length);
  const [all, setAll] = useState(false);
  const opened = useRef(false);

  // The server's copy has arrived: drop the stand-in bubble.
  useEffect(() => {
    if (messages.length !== seen.current) {
      seen.current = messages.length;
      setSending(null);
    }
  }, [messages.length]);

  // Follow the conversation once it moves, but open on Up next.
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    const main = end.current?.closest("main");
    main?.scrollTo({ top: main.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const shown = all ? messages : messages.slice(-RECENT);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_PHOTOS - drafts.length;
    const picked = [...list].slice(0, room);
    if (list.length > room) setError(`Add up to ${MAX_PHOTOS} files at a time.`);
    setDrafts((d) => [...d, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  async function send(message: string) {
    const body = message.trim();
    if (sending || (!body && !drafts.length)) return;
    setError(null);
    const photos = drafts;
    setSending({
      text: body,
      images: photos.filter((p) => isImage(p.file)).map((p) => p.url),
    });

    try {
      const files: Uploaded[] = [];
      for (const { file } of photos) files.push(await uploadToProject(projectId, "chat", file));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, text: body, files }),
      });
      const result = (await res.json().catch(() => null)) as {
        ok: boolean;
        error?: string;
        saved?: boolean;
      } | null;
      if (!result?.ok) {
        setError(result?.error ?? "That didn't send. Check your connection and try again.");
        if (!result?.saved) {
          setSending(null);
          return;
        }
      }
      setText("");
      setDrafts([]);
      router.refresh();
    } catch (e) {
      setSending(null);
      setError(
        e instanceof Error && e.message.includes("upload")
          ? e.message
          : "That didn't send. Check your connection and try again.",
      );
    }
  }

  const busy = sending != null;

  return (
    <section aria-label="Chat" className="flex flex-1 flex-col gap-3">
      <div className="flex flex-1 flex-col gap-3" aria-live="polite">
        {!messages.length && <Bubble role="assistant">{canEdit ? WELCOME : WELCOME_VIEWER}</Bubble>}
        {shown.length < messages.length && (
          <button
            type="button"
            className="text-accent min-h-11 self-center text-[14px] font-medium"
            onClick={() => setAll(true)}
          >
            Show earlier messages
          </button>
        )}
        {shown.map((m) => (
          <div
            key={m.id}
            className={`grid max-w-[94%] gap-2 md:max-w-[88%] ${m.role === "user" && m.mine ? "justify-items-end self-end" : ""}`}
          >
            {m.author && <p className="text-muted -mb-1 text-[12.5px] font-semibold">{m.author}</p>}
            {m.images.length > 0 && <Thumbs urls={m.images} />}
            {m.documents.length > 0 && (
              <ul className="flex flex-wrap justify-end gap-1.5">
                {m.documents.map((n) => (
                  <li key={n}>
                    <Link
                      href="/documents"
                      className="border-line bg-paper inline-block rounded border px-2.5 py-1.5 text-[13px]"
                    >
                      📄 {n}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {m.text && (
              <Bubble role={m.role} other={m.role === "user" && !m.mine}>
                {m.text}
              </Bubble>
            )}
            {m.cards.map((c) => (
              <ProposalCard key={c.id} card={c} canEdit={canEdit} />
            ))}
          </div>
        ))}
        {sending && (
          <>
            {(sending.text || sending.images.length > 0) && (
              <div className="grid max-w-[94%] justify-items-end gap-2 self-end">
                {sending.images.length > 0 && <Thumbs urls={sending.images} />}
                {sending.text && <Bubble role="user">{sending.text}</Bubble>}
              </div>
            )}
            <Bubble role="assistant">
              <span className="text-muted animate-pulse">
                {sending.images.length ? "Reading that…" : "Thinking…"}
              </span>
            </Bubble>
          </>
        )}
        <div ref={end} />
      </div>

      <form
        className="border-line bg-bg sticky -bottom-3 -mx-[max(16px,env(safe-area-inset-left))] grid gap-2 border-t px-[max(10px,env(safe-area-inset-left))] pt-2 pb-3 md:mx-0 md:rounded md:border md:px-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        {drafts.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1" aria-label="Files to send">
            {drafts.map((d, i) => (
              <li key={d.url} className="relative">
                {isImage(d.file) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.url}
                    alt=""
                    className="border-line size-14 rounded border object-cover"
                  />
                ) : (
                  <span className="border-line bg-paper flex h-14 max-w-40 items-center rounded border px-2 text-[12.5px] [overflow-wrap:anywhere]">
                    {d.file.name}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${d.file.name}`}
                  className="bg-ink text-paper absolute -top-2 -right-2 grid size-6 place-items-center rounded-full text-[13px]"
                  onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && !busy && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="border-line bg-paper hover:border-accent min-h-9 rounded-full border px-3 text-left text-[13.5px]"
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          {canEdit && (
            <label
              className="border-line bg-paper grid size-11 flex-none cursor-pointer place-items-center rounded border"
              title="Add photos of invoices, samples or progress, or a PDF"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-ink size-5"
                aria-hidden="true"
              >
                <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="sr-only">Add photos or documents</span>
              <input
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                hidden
                disabled={busy}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <textarea
            ref={box}
            aria-label="Message"
            rows={1}
            value={text}
            maxLength={4000}
            placeholder={canEdit ? "Tell me what happened…" : "Ask about the project…"}
            className="border-line bg-paper placeholder:text-muted/70 [field-sizing:content] max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded border px-3 py-2 text-base"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                window.matchMedia("(pointer: fine)").matches
              ) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <button
            className="bg-accent text-accent-ink min-h-11 flex-none rounded px-4 text-[15px] font-semibold disabled:opacity-50"
            disabled={busy || (!text.trim() && !drafts.length)}
          >
            Send
          </button>
        </div>
        {error && (
          <p role="alert" className="bg-bad-soft rounded px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

function Bubble({
  role,
  other,
  children,
}: {
  role: "user" | "assistant";
  other?: boolean;
  children: React.ReactNode;
}) {
  const style =
    role === "assistant"
      ? "bg-paper border border-line rounded-bl-[3px]"
      : other
        ? "bg-pending-soft rounded-bl-[3px]"
        : "bg-accent text-accent-ink rounded-br-[3px]";
  return (
    <div
      className={`w-fit rounded-xl px-3 py-2 text-[15px] leading-snug [overflow-wrap:anywhere] whitespace-pre-wrap ${style}`}
    >
      {children}
    </div>
  );
}

function Thumbs({ urls }: { urls: string[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={u}
            alt="Attached photo"
            className="border-line size-22 rounded border object-cover"
          />
        </a>
      ))}
    </div>
  );
}
