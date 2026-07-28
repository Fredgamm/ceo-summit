import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface MemberRoomWarningEmailProps {
  roomName: string;
}

/** E4-T04 — décision "Avertir le membre" sur un signalement de message. */
export default function MemberRoomWarningEmail({
  roomName = "Énergie & Environnement",
}: MemberRoomWarningEmailProps) {
  return (
    <EmailLayout preview={`Avertissement — salle ${roomName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Avertissement — salle {roomName}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Un message que vous avez publié dans la salle <strong>{roomName}</strong> a été signalé et
        jugé non conforme à la charte des salles thématiques CEO Summit. Merci de veiller au respect
        des échanges dans les prochaines discussions.
      </Text>
    </EmailLayout>
  );
}
