import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface BroadcastEmailProps {
  subject: string;
  body: string;
}

/** E8-T09 — template générique pour un broadcast admin (corps déjà substitué par lib/broadcast-template.ts). */
export default function BroadcastEmail({
  subject = "CEO Summit 2026 — Ouverture des inscriptions",
  body = "Chers membres CEO Summit,\n\nNous avons le plaisir de vous annoncer…",
}: BroadcastEmailProps) {
  return (
    <EmailLayout preview={subject}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        {subject}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: "#4A4A4A",
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {body}
      </Text>
    </EmailLayout>
  );
}
