import { Brand } from "./Brand";

/** Layout for pages outside a project: sign-in, invites, first project. */
export function PlainShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line top-safe flex-none border-b px-[max(16px,env(safe-area-inset-left))] pb-2">
        <Brand />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-[max(16px,env(safe-area-inset-left))] py-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
