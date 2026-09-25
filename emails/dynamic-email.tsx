import { Hr, Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";
import { parseInlineMarkdown, type EmailBlock } from "@/lib/email-blocks";

/**
 * Rend le formatage inline limité (**gras**, _italique_, [texte](url)) en
 * éléments React — jamais en HTML. Voir lib/email-blocks.ts::parseInlineMarkdown
 * pour le détail du filtrage de schéma d'URL.
 */
function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInlineMarkdown(text).map((tok, i) => {
        if (tok.kind === "bold") return <strong key={i}>{tok.value}</strong>;
        if (tok.kind === "italic") return <em key={i}>{tok.value}</em>;
        if (tok.kind === "link") {
          return (
            <a key={i} href={tok.href} style={{ color: emailColors.navy }}>
              {tok.value}
            </a>
          );
        }
        return <span key={i}>{tok.value}</span>;
      })}
    </>
  );
}

interface DynamicEmailProps {
  preview: string;
  blocks: EmailBlock[];
}

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — composant présentationnel pur qui rend un `EmailBlock[]` (issu du
 * registre par défaut ou d'un `EmailTemplateOverride`, voir
 * lib/email-template-resolver.ts) dans le même habillage de marque que tous
 * les autres emails transactionnels (`EmailLayout`).
 */
export function DynamicEmail({ preview, blocks }: DynamicEmailProps) {
  return (
    <EmailLayout preview={preview}>
      {blocks.map((block) => {
        switch (block.type) {
          case "heading":
            return (
              <Text
                key={block.id}
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: emailColors.navy,
                  margin: "0 0 16px",
                }}
              >
                <InlineText text={block.text} />
              </Text>
            );
          case "paragraph":
            return (
              <Text
                key={block.id}
                style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}
              >
                <InlineText text={block.text} />
              </Text>
            );
          case "button":
            return (
              <a key={block.id} href={block.url} style={emailButtonStyle}>
                {block.label}
              </a>
            );
          case "divider":
            return (
              <Hr key={block.id} style={{ borderColor: emailColors.border, margin: "16px 0" }} />
            );
          case "list": {
            const ListTag = block.style === "number" ? "ol" : "ul";
            return (
              <ListTag
                key={block.id}
                style={{
                  margin: "0 0 16px",
                  paddingLeft: 20,
                  color: "#4A4A4A",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {block.items.map((item, i) => (
                  <li key={i}>
                    <InlineText text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
        }
      })}
    </EmailLayout>
  );
}

export default DynamicEmail;
