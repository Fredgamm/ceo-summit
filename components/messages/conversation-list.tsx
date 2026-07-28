"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, initials } from "@/lib/utils";

export interface ConversationListItem {
  id: string;
  otherUser: { id: string; name: string; avatarUrl: string | null };
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

function formatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday)
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

/** E7-T01 — recherche client-side (liste déjà chargée/déchiffrée, pas de round-trip serveur). */
export function ConversationList({ conversations }: { conversations: ConversationListItem[] }) {
  const [query, setQuery] = React.useState("");
  const pathname = usePathname();

  const filtered = query.trim()
    ? conversations.filter((c) =>
        c.otherUser.name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : conversations;

  return (
    <div className="flex h-full flex-col">
      <div className="relative border-b border-border p-3">
        <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="pl-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Aucune conversation" />
          </div>
        ) : (
          filtered.map((c) => {
            const active = pathname === `/messagerie/${c.id}`;
            return (
              <Link
                key={c.id}
                href={`/messagerie/${c.id}`}
                className={cn(
                  "flex items-center gap-2.5 border-b border-border/60 px-4 py-3 transition-colors hover:bg-surface",
                  active && "bg-surface"
                )}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={c.otherUser.avatarUrl ?? undefined} alt={c.otherUser.name} />
                  <AvatarFallback>{initials(c.otherUser.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-navy">{c.otherUser.name}</p>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {formatListTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-text-muted">
                    {c.lastMessagePreview ?? "Aucun message"}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
