import { TabBar } from "@/components/TabBar";

/**
 * Fixed app shell, as in the prototype: header and tab bar stay put and only
 * the content scrolls. The extra 12px under the safe area keeps the title clear
 * of the blur iOS draws beneath the status bar, which reaches past the inset.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-line bg-bg sticky top-0 z-10 flex-none border-b px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top)+12px)] md:pt-[env(safe-area-inset-top)]">
        <div className="font-display min-w-0 py-2 text-[17px] leading-tight font-extrabold tracking-[-.01em] [font-stretch:118%] md:py-3 md:text-[19px]">
          Reno Logbook
          <small className="text-muted block truncate font-sans text-[12.5px] font-medium tracking-normal [font-stretch:100%]">
            No project yet
          </small>
        </div>
      </header>
      <TabBar />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(16px,env(safe-area-inset-left))] py-3">
        {children}
      </main>
    </div>
  );
}
