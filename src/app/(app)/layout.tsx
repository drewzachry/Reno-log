import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { HeaderMenu } from "@/components/HeaderMenu";
import { LiveRefresh } from "@/components/LiveRefresh";
import { TabBar } from "@/components/TabBar";
import { getSession } from "@/lib/projects";

/**
 * Fixed app shell, as in the prototype: header and tab bar stay put and only
 * the content scrolls. The extra 12px under the safe area keeps the title clear
 * of the blur iOS draws beneath the status bar, which reaches past the inset.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, projects, current } = await getSession();
  if (!user) redirect("/login");
  if (!current) redirect("/start");

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-line bg-bg top-safe sticky top-0 z-10 flex flex-none items-center gap-3 border-b px-[max(16px,env(safe-area-inset-left))] pb-2 md:pb-0">
        <div className="min-w-0 flex-1 md:py-3">
          <Brand subtitle={current.name} />
        </div>
        <HeaderMenu projects={projects} currentId={current.id} />
      </header>
      <TabBar />
      <LiveRefresh projectId={current.id} />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(16px,env(safe-area-inset-left))] py-3">
        {children}
      </main>
    </div>
  );
}
