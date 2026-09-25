import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildConversationsWhere, otherParticipantId } from "@/lib/conversations-query";
import { decryptMessageContent } from "@/lib/message-crypto";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import {
  ConversationList,
  type ConversationListItem,
} from "@/components/messages/conversation-list";
import { SplitPane } from "@/components/messages/split-pane";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Messagerie" };

const PREVIEW_MAX_LENGTH = 60;

/** E7-T01 — layout partagé /messagerie + /messagerie/[id] : la liste ne se recharge jamais entre les deux. */
export default async function MessagerieLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const conversations = await prisma.conversation.findMany({
    where: buildConversationsWhere(viewer.id),
    orderBy: { lastMessageAt: "desc" },
    include: {
      member1: { select: { id: true, name: true, avatarUrl: true } },
      member2: { select: { id: true, name: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: { messages: { where: { senderId: { not: viewer.id }, readAt: null } } },
      },
    },
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c._count.messages, 0);

  const items: ConversationListItem[] = await Promise.all(
    conversations.map(async (c) => {
      const otherId = otherParticipantId(c, viewer.id);
      const otherUser = c.member1Id === otherId ? c.member1 : c.member2;
      const lastMessage = c.messages[0];
      const preview = lastMessage ? await decryptMessageContent(lastMessage.content) : null;

      return {
        id: c.id,
        otherUser,
        lastMessagePreview: preview
          ? preview.length > PREVIEW_MAX_LENGTH
            ? `${preview.slice(0, PREVIEW_MAX_LENGTH)}…`
            : preview
          : null,
        lastMessageAt: c.lastMessageAt.toISOString(),
        unreadCount: c._count.messages,
      };
    })
  );

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(getViewerTierFromCompany(viewer.company)),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: totalUnread || undefined }}
    >
      {/* Audit mobile 22 sept. 2026 (conception/14 §2) — 100dvh (dynamic
          viewport height) s'ajuste à la barre d'adresse mobile qui
          apparaît/disparaît au scroll, contrairement à 100vh (statique) qui
          cassait la mise en page sur mobile ; même correctif déjà appliqué à
          components/rooms/room-chat.tsx pour le même type d'écran (fil de
          discussion plein écran). 100vh classique à partir de md: (desktop,
          où dvh n'apporte rien).
          188px (conception/14 §1) = padding haut du conteneur AppShell côté
          mobile (pt-16, 64px, réservé pour MobileHeader) + padding bas
          (pb-24, 96px, réservé pour MobileBottomNav) + 28px de marge (même
          méthode que l'ancien 140px = 16+96+28 avant l'ajout du header
          mobile). Desktop (md:) inchangé. */}
      <div className="flex h-[calc(100dvh-188px)] overflow-hidden rounded-lg border border-border bg-white md:h-[calc(100vh-140px)]">
        <SplitPane
          variant="list"
          className="flex w-full shrink-0 flex-col border-r border-border md:w-[300px]"
        >
          <ConversationList conversations={items} />
        </SplitPane>
        <SplitPane variant="detail" className="flex w-full flex-1 flex-col">
          {children}
        </SplitPane>
      </div>
    </AppShell>
  );
}
