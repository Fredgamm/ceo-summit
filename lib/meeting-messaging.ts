import { prisma } from "@/lib/prisma";
import { getOrCreateConversation } from "@/lib/conversations";
import { encryptMessageContent } from "@/lib/message-crypto";

/**
 * Module 21 (3 nov. 2026) — le mot que le destinataire laisse en répondant à
 * une demande de rendez-vous est aussi déposé dans la messagerie, pour que les
 * deux personnes puissent continuer à s'écrire (où se retrouver, comment se
 * reconnaître). Même stockage que les messages du serveur temps réel : chiffré
 * en base, compté dans les « non lus » du destinataire. Pas d'envoi en temps
 * réel : il apparaît à l'ouverture de la messagerie, et l'email du rendez-vous
 * le porte déjà.
 */
export async function postMeetingResponseMessage(input: {
  fromUserId: string;
  toUserId: string;
  /** « lundi 11 janvier, 09h30 » : rappelle de quel rendez-vous il s'agit. */
  slotLabel: string;
  text: string;
}): Promise<void> {
  const conversation = await getOrCreateConversation(input.fromUserId, input.toUserId);
  const content = await encryptMessageContent(
    `À propos de notre rendez-vous du ${input.slotLabel} : ${input.text}`
  );
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, senderId: input.fromUserId, content },
    select: { createdAt: true },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt },
  });
}
