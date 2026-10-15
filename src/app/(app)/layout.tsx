import { TabBar } from "@/components/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
      <header className="border-line bg-surface/95 sticky top-0 z-10 border-b px-4 py-3 backdrop-blur">
        <p className="font-display text-lg font-semibold">Reno Logbook</p>
      </header>
      <main className="mx-auto max-w-xl pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
