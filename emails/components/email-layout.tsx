import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const COLORS = {
  navy: "#1A2B5F",
  gold: "#C9A84C",
  surface: "#F7F7F5",
  textMuted: "#8A8A8A",
  border: "#E4E4E4",
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
      <Body style={{ backgroundColor: COLORS.surface, fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "32px 16px" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
          <Section style={{ backgroundColor: COLORS.navy, padding: "24px 32px" }}>
            <Text style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff" }}>
              CEO<span style={{ color: COLORS.gold }}>Summit</span>
            </Text>
            <Text style={{ margin: "2px 0 0", fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
              Océan Indien · Décideurs
            </Text>
          </Section>

          <Section style={{ padding: "32px" }}>{children}</Section>

          <Hr style={{ borderColor: COLORS.border, margin: 0 }} />
          <Section style={{ padding: "20px 32px" }}>
            <Text style={{ margin: 0, fontSize: 11, color: COLORS.textMuted }}>
              CEO Summit © 2026 — Plateforme réservée aux membres. Vous recevez cet email car
              une action a été effectuée sur votre compte CEO Summit.
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
