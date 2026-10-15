import { TabBar } from "@/components/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-[max(16px,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)] pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
      <header className="border-line flex items-center gap-3 border-b py-2 md:py-3">
        <div className="font-display min-w-0 text-[17px] leading-tight font-extrabold tracking-[-.01em] [font-stretch:118%] md:text-[19px]">
          Reno Logbook
          <small className="text-muted block truncate font-sans text-[12.5px] font-medium tracking-normal [font-stretch:100%]">
            No project yet
          </small>
        </div>
      </header>
      <TabBar />
      <main className="py-3">{children}</main>
    </div>
  );
}
