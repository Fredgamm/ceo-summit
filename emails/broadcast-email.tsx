import { Link, Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface BroadcastAttachment {
  name: string;
  url: string;
}

interface BroadcastEmailProps {
  subject: string;
  body: string;
  /**
   * Rapport QA du 1er oct. 2026 (§3.2a) — liens signés (pas de pièce jointe
   * binaire réelle, décision du client : plus simple, plus léger pour la
   * délivrabilité SMTP) vers les fichiers joints au broadcast.
   */
  attachments?: BroadcastAttachment[];
}

/** E8-T09 — template générique pour un broadcast admin (corps déjà substitué par lib/broadcast-template.ts). */
export default function BroadcastEmail({
  subject = "CEO Summit 2026 — Ouverture des inscriptions",
  body = "Chers membres CEO Summit,\n\nNous avons le plaisir de vous annoncer…",
  attachments = [],
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
      {attachments.length > 0 && (
        <Text
          style={{ fontSize: 13, lineHeight: 1.8, color: emailColors.navy, margin: "20px 0 0" }}
        >
          Pièce{attachments.length > 1 ? "s" : ""} jointe{attachments.length > 1 ? "s" : ""} :
          <br />
          {attachments.map((a, i) => (
            <span key={a.url}>
              {i > 0 && <br />}
              <Link href={a.url} style={{ color: emailColors.navy }}>
                📎 {a.name}
              </Link>
            </span>
          ))}
        </Text>
      )}
    </EmailLayout>
  );
}
