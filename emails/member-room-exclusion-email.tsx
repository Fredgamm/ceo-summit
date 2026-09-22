import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface MemberRoomExclusionEmailProps {
  roomName: string;
  suspendedUntilLabel: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — pendant du
 * MemberRoomWarningEmail pour la décision "Exclure" d'un signalement : la
 * branche RESOLVED_EXCLUDED (resolveRoomReport) créait la suspension sans
 * jamais en informer le membre, contrairement à RESOLVED_WARNED.
 */
export default function MemberRoomExclusionEmail({
  roomName = "Énergie & Environnement",
  suspendedUntilLabel = "29 septembre 2026",
}: MemberRoomExclusionEmailProps) {
  return (
    <EmailLayout preview={`Exclusion temporaire — salle ${roomName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Exclusion temporaire — salle {roomName}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Suite au signalement d&apos;un message que vous avez publié dans la salle{" "}
        <strong>{roomName}</strong>, votre accès à cette salle est suspendu jusqu&apos;au{" "}
        <strong>{suspendedUntilLabel}</strong>. Le reste de la plateforme reste accessible.
      </Text>
    </EmailLayout>
  );
}
