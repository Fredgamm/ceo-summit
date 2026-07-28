import { prisma } from "../lib/prisma";
import { sendTransactionalEmail } from "../lib/resend";
import MessageNotificationEmail from "../emails/message-notification-email";

export const OFFLINE_EMAIL_DELAY_MS = 60_000;
const ANTI_SPAM_WINDOW_MS = 60 * 60 * 1000;

interface OfflineCheckParams {
  conversationId: string;
  recipientId: string;
  senderId: string;
  preview: string;
}

/**
 * E7-T03 — "Si destinataire offline (pas de socket connecté) → email Resend
 * dans les 60s. Max 1 email par conversation par heure (anti-spam)."
 * Pure-ish and exported standalone so it's unit-testable without waiting on
 * a real 60s setTimeout — scheduleOfflineEmailCheck is the only caller that
 * actually delays, this function itself runs immediately when called.
 */
export async function sendOfflineEmailIfNeeded(
  connectedUsers: Map<string, Set<string>>,
  { conversationId, recipientId, senderId, preview }: OfflineCheckParams
): Promise<void> {
  if ((connectedUsers.get(recipientId)?.size ?? 0) > 0) return; // reconnected in the meantime

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;
  if (
    conversation.lastEmailNotifiedAt &&
    Date.now() - conversation.lastEmailNotifiedAt.getTime() < ANTI_SPAM_WINDOW_MS
  ) {
    return;
  }

  const [recipient, sender] = await Promise.all([
    prisma.user.findUnique({ where: { id: recipientId } }),
    prisma.user.findUnique({ where: { id: senderId } }),
  ]);
  if (!recipient || !sender) return;

  await sendTransactionalEmail({
    to: recipient.email,
    subject: `Nouveau message de ${sender.name}`,
    react: MessageNotificationEmail({
      senderName: sender.name,
      preview,
      conversationUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/messagerie/${conversationId}`,
    }),
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastEmailNotifiedAt: new Date() },
  });
}

export function scheduleOfflineEmailCheck(
  connectedUsers: Map<string, Set<string>>,
  params: OfflineCheckParams,
  delayMs: number = OFFLINE_EMAIL_DELAY_MS
): void {
  setTimeout(() => {
    sendOfflineEmailIfNeeded(connectedUsers, params).catch((err) =>
      console.error("[socket] offline email notification failed:", err)
    );
  }, delayMs);
}
