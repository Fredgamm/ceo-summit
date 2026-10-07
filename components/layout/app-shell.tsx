import { MemberSidebar } from "@/components/layout/member-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { InstallPrompt } from "@/components/layout/install-prompt";
import { cn } from "@/lib/utils";

interface AppShellProps {
  user: { name: string; avatarUrl?: string | null; isAdmin?: boolean };
  badges?: {
    opportunities?: number;
    rooms?: number;
    messages?: number;
  };
  /** Optional 280px right panel (credits, upcoming events...) — desktop only, matches wireframe .right-panel */
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Top-level layout for every member-facing page.
 * Desktop (≥768px): 220px navy sidebar + main + optional 280px right panel.
 * Mobile (<768px): sidebar and right panel hidden, header + bottom nav take over
 * (audit mobile du 22 septembre 2026, conception/14 §1 — MobileHeader complète
 * MobileBottomNav pour reproduire la sidebar desktop en entier sur mobile).
 * Body gets top/bottom padding on mobile so content isn't hidden behind them.
 */
export function AppShell({ user, badges, rightPanel, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <MemberSidebar user={user} badges={badges} />

      <main
        id="main-content"
        className={cn("min-h-screen flex-1 md:ml-sidebar", rightPanel && "md:mr-right-panel")}
      >
        <div className="p-4 pb-24 pt-16 md:p-7 md:pb-7 md:pt-7">{children}</div>
      </main>

      {rightPanel && (
        <aside className="fixed right-0 top-0 hidden h-screen w-right-panel overflow-y-auto border-l border-border bg-white px-5 py-6 lg:block">
          {rightPanel}
        </aside>
      )}

      <MobileHeader />
      <MobileBottomNav badges={{ rooms: badges?.rooms, messages: badges?.messages }} />
      <InstallPrompt />
    </div>
  );
}
