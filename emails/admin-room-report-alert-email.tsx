import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface AdminRoomReportAlertEmailProps {
  reporterName: string;
  roomName: string;
}

/** E4-T03/T04 — "Bouton signalement message → alerte admin". */
export default function AdminRoomReportAlertEmail({
  reporterName = "Jean-Pierre Rakoto",
  roomName = "Énergie & Environnement",
}: AdminRoomReportAlertEmailProps) {
  return (
    <EmailLayout preview={`Message signalé dans ${roomName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Message signalé — salle {roomName}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        <strong>{reporterName}</strong> a signalé un message dans la salle{" "}
        <strong>{roomName}</strong>. Il est en attente de traitement dans le back-office.
      </Text>
    </EmailLayout>
  );
}
