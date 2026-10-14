import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { appUrl } from "@/lib/app-url";
import { CEO_SUMMIT_CONTACT } from "@/lib/ceo-summit-contact";

const COLORS = {
  navy: "#1A2B5F",
  gold: "#C9A84C",
  surface: "#F7F7F5",
  textMuted: "#8A8A8A",
  border: "#E4E4E4",
};

const footerLinkStyle: React.CSSProperties = {
  color: COLORS.textMuted,
  textDecoration: "underline",
};

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

/**
 * Shared shell for every transactional email — navy header with the CEO
 * Summit wordmark, white content card, muted footer. Keeps every template
 * (activation, reset password, event reminders, Deal Room notifications...)
 * visually consistent with the platform's premium/discreet positioning.
 */
export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: COLORS.surface,
          fontFamily: "Arial, Helvetica, sans-serif",
          margin: 0,
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            maxWidth: 480,
            margin: "0 auto",
            backgroundColor: "#fff",
            borderRadius: 8,
            overflow: "hidden",
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <Section
            style={{
              backgroundColor: COLORS.surface,
              borderBottom: `1px solid ${COLORS.border}`,
              padding: "20px 32px",
            }}
          >
            {/* 30 septembre 2026 (rapport QA) — logo en image plutôt qu'un
             * wordmark texte. Fond clair (pas navy) : le logo est
             * bicolore navy/rouge sur fond transparent, illisible sur un
             * fond navy. Hébergé dans /public plutôt que sur le CDN
             * WordPress externe fourni par le testeur — un lien tiers
             * n'est pas garanti stable et beaucoup de clients mail
             * bloquent les images externes par défaut. */}
            <Img
              src={`${appUrl()}/logo/ceo-summit-logo.png`}
              alt="CEO Summit Indian Ocean"
              width="150"
              height="72"
              style={{ display: "block" }}
            />
            <Text
              style={{
                margin: "8px 0 0",
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: COLORS.textMuted,
              }}
            >
              Océan Indien · Décideurs
            </Text>
          </Section>

          <Section style={{ padding: "32px" }}>{children}</Section>

          <Hr style={{ borderColor: COLORS.border, margin: 0 }} />
          <Section style={{ padding: "20px 32px" }}>
            <Text style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: COLORS.navy }}>
              {CEO_SUMMIT_CONTACT.name}
            </Text>
            <Text style={{ margin: 0, fontSize: 11, lineHeight: "16px", color: COLORS.textMuted }}>
              {CEO_SUMMIT_CONTACT.addressLines[0]}
              <br />
              {CEO_SUMMIT_CONTACT.addressLines[1]}
              <br />
              <Link href={CEO_SUMMIT_CONTACT.phoneHref} style={footerLinkStyle}>
                {CEO_SUMMIT_CONTACT.phone}
              </Link>
              {" · "}
              <Link href={`mailto:${CEO_SUMMIT_CONTACT.email}`} style={footerLinkStyle}>
                {CEO_SUMMIT_CONTACT.email}
              </Link>
              {" · "}
              <Link href={CEO_SUMMIT_CONTACT.websiteHref} style={footerLinkStyle}>
                {CEO_SUMMIT_CONTACT.website}
              </Link>
            </Text>
            <Text
              style={{
                margin: "12px 0 0",
                fontSize: 11,
                lineHeight: "16px",
                color: COLORS.textMuted,
              }}
            >
              CEO Summit © 2026 — Plateforme réservée aux membres. Vous recevez cet email car une
              action a été effectuée sur votre compte CEO Summit.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailButtonStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: COLORS.navy,
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  padding: "12px 28px",
  borderRadius: 6,
  marginTop: 8,
};

export const emailColors = COLORS;
