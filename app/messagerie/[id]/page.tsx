import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Diamond } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { otherParticipantId } from "@/lib/conversations-query";
import { decryptMessages } from "@/lib/message-crypto";
import { ConversationThread } from "@/components/messages/conversation-thread";

export const metadata: Metadata = { title: "Conversation" };
const MESSAGE_PAGE_SIZE = 50;

/** E7-T02/T04 — thread + bandeau de contexte Deal Room si la conversation en vient. */
export default async function ConversationPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
  if (!conversation) notFound();
  if (conversation.member1Id !== session.user.id && conversation.member2Id !== session.user.id) {
    notFound();
  }

  const otherId = otherParticipantId(conversation, session.user.id);
  const [otherUser, messages, opportunity] = await Promise.all([
    prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, name: true, avatarUrl: true },
    }),
    prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_PAGE_SIZE,
    }),
    conversation.opportunityId
      ? prisma.opportunity.findUnique({
          where: { id: conversation.opportunityId },
          select: { id: true, title: true },
        })
      : null,
  ]);
  if (!otherUser) notFound();

  const decrypted = await decryptMessages(messages.reverse());

  return (
    <div className="flex h-full flex-col">
      {opportunity && (
        <div className="flex items-center gap-2 border-b border-border bg-navy-light px-5 py-2 text-sm text-navy">
          <Diamond className="h-3.5 w-3.5" />
          <span>
            Contexte : Opportunité Deal Room —{" "}
            <Link href={`/deal-room/${opportunity.id}`} className="font-semibold underline">
              {opportunity.title}
            </Link>
          </span>
        </div>
      )}
      <ConversationThread
        conversation={{ id: conversation.id }}
        otherUser={otherUser}
        initialMessages={decrypted.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          content: m.content,
          readAt: m.readAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
        }))}
        hasMoreOlder={messages.length === MESSAGE_PAGE_SIZE}
        viewer={{ id: session.user.id }}
      />
    </div>
  );
}
