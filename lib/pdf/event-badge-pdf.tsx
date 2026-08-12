import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

import { initials } from "@/lib/utils";

/**
 * Badge téléchargeable au format A6 (7 août 2026, demande client 3ème
 * édition) — la page /evenements/[id]/badge n'était consultable qu'en
 * ligne, jamais comme un vrai fichier. Design générique en attendant les
 * vrais visuels CEO Summit (logo, gabarit) : couleurs de marque reprises de
 * tailwind.config.ts, mais aucun fichier logo n'existe encore dans le
 * projet — à remplacer dès qu'un visuel est fourni (voir `styles.logoSlot`,
 * actuellement du texte).
 */

const NAVY_DARK = "#0D1B42";
const GOLD = "#C9A84C";

const styles = StyleSheet.create({
  page: {
    backgroundColor: NAVY_DARK,
    color: "#FFFFFF",
    padding: 18,
    justifyContent: "space-between",
    fontFamily: "Helvetica",
  },
  logoSlot: {
    fontSize: 8,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 2,
  },
  eventMeta: {
    fontSize: 8,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 14,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  photo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  photoFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoFallbackText: {
    fontSize: 16,
    fontWeight: 700,
  },
  name: {
    fontSize: 13,
    fontWeight: 700,
  },
  titleCompany: {
    fontSize: 9,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  accessBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: GOLD,
    color: NAVY_DARK,
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  qrCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  qrImage: {
    width: 160,
    height: 160,
  },
  footerNote: {
    marginTop: 10,
    fontSize: 7,
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
  },
});

export interface EventBadgePdfProps {
  eventTitle: string;
  eventDateLabel: string;
  eventLocation: string;
  participantName: string;
  participantTitle: string | null;
  companyName: string | null;
  avatarUrl: string | null;
  accessLabel: string;
  qrCodeDataUrl: string;
}

function EventBadgeDocument(props: EventBadgePdfProps) {
  return (
    <Document>
      <Page size="A6" style={styles.page}>
        <View>
          <Text style={styles.logoSlot}>CEO Summit — Océan Indien</Text>
          <Text style={styles.eventTitle}>{props.eventTitle}</Text>
          <Text style={styles.eventMeta}>
            {props.eventDateLabel} · {props.eventLocation}
          </Text>
        </View>

        <View style={styles.identityRow}>
          {props.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={props.avatarUrl} style={styles.photo} />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={styles.photoFallbackText}>{initials(props.participantName)}</Text>
            </View>
          )}
          <View>
            <Text style={styles.name}>{props.participantName}</Text>
            {(props.participantTitle || props.companyName) && (
              <Text style={styles.titleCompany}>
                {[props.participantTitle, props.companyName].filter(Boolean).join(" — ")}
              </Text>
            )}
            <Text style={styles.accessBadge}>{props.accessLabel}</Text>
          </View>
        </View>

        <View style={styles.qrCard}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={props.qrCodeDataUrl} style={styles.qrImage} />
        </View>

        <Text style={styles.footerNote}>
          Présentez ce badge (écran ou imprimé) à l&apos;accueil.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderEventBadgePdf(props: EventBadgePdfProps): Promise<Buffer> {
  return renderToBuffer(<EventBadgeDocument {...props} />);
}
