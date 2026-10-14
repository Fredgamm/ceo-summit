import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildConversationsWhere, otherParticipantId } from "@/lib/conversations-query";
import { decryptMessageContent } from "@/lib/message-crypto";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import {
  ConversationList,
  type ConversationListItem,
} from "@/components/messages/conversation-list";
import { SplitPane } from "@/components/messages/split-pane";

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
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: totalUnread || undefined }}
    >
      {/* 14 oct. 2026 — mobile : pleine largeur et pleine hauteur entre l'en-tête et la
          barre du bas (comme components/rooms/room-chat.tsx), marges négatives pour
          annuler le padding d'AppShell : seule la conversation défile. */}
      <div className="-mx-4 -mb-24 -mt-3 flex h-[calc(100dvh-106px-env(safe-area-inset-bottom,0px))] overflow-hidden bg-white md:m-0 md:h-[calc(100vh-140px)] md:rounded-lg md:border md:border-border">
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
