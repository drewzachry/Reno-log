"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { cancelInvite, changeRole, removePerson } from "@/lib/actions/people";
import { ROLE_LABEL, type Role } from "@/lib/roles";

export type Person = { userId: string; name: string; email: string; role: Role };
export type PendingInvite = { id: string; email: string; role: Role; expiresOn: string };

export function PeopleList({
  people,
  invites,
  meId,
  canManage,
  canInvite,
}: {
  people: Person[];
  invites: PendingInvite[];
  meId: string;
  canManage: boolean;
  canInvite: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ error?: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(undefined);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
    });
  };

  return (
    <div className="grid gap-3">
      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
      <ul className="divide-line border-line bg-paper divide-y overflow-hidden rounded border">
        {people.map((p) => (
          <li key={p.userId} className="grid gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {p.name}
                {p.userId === meId && <span className="text-muted font-normal"> (you)</span>}
              </p>
              <p className="text-muted truncate text-sm">{p.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && p.role !== "owner" ? (
                <select
                  aria-label={`Role for ${p.name}`}
                  className={`${ui.input} w-auto min-w-32`}
                  defaultValue={p.role}
                  disabled={pending}
                  onChange={(e) => act(() => changeRole(p.userId, e.target.value))}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="bg-accent-soft rounded px-2 py-1 text-sm font-semibold">
                  {ROLE_LABEL[p.role]}
                </span>
              )}
              {p.role !== "owner" && (canManage || p.userId === meId) && (
                <button
                  type="button"
                  className={`${ui.danger} ml-auto`}
                  disabled={pending}
                  onClick={() =>
                    act(
                      () => removePerson(p.userId),
                      p.userId === meId
                        ? "Leave this project? You'll lose access straight away."
                        : `Remove ${p.name}? They'll lose access straight away.`,
                    )
                  }
                >
                  {p.userId === meId ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h3 className={`${ui.eyebrow} mt-2`}>Waiting to join</h3>
          <ul className="divide-line border-line bg-paper divide-y overflow-hidden rounded border">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{i.email}</p>
                  <p className="text-muted text-sm">
                    {ROLE_LABEL[i.role]} · link works until {i.expiresOn}
                  </p>
                </div>
                {canInvite && (
                  <button
                    type="button"
                    className={ui.ghost}
                    disabled={pending}
                    onClick={() =>
                      act(() => cancelInvite(i.id), `Cancel the invite for ${i.email}?`)
                    }
                  >
                    Cancel invite
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canInvite && (
            <p className={ui.note}>
              Lost the link? Invite the same email again; the old link stops working.
            </p>
          )}
        </>
      )}
    </div>
  );
}
