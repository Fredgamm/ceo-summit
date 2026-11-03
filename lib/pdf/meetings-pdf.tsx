import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

import type { MeetingTable } from "@/lib/meeting-admin";

/**
 * Module 21 lot 9 (3 nov. 2026) — liste des rendez-vous B2B et liste terrain
 * en PDF A4 paysage : même tableau que le CSV (`MeetingTable`), même modèle
 * que l'export comptable (`finance-export-pdf.tsx`).
 */

const NAVY = "#1A2B5F";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#1A1A1A" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 3, marginBottom: 14 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  headerRow: { flexDirection: "row", backgroundColor: NAVY },
  headerCell: { padding: 5, color: "#FFFFFF", fontFamily: "Helvetica-Bold" },
  cell: { padding: 5 },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: MUTED },
  empty: { marginTop: 20, fontSize: 10, color: MUTED },
});

export interface MeetingsPdfProps {
  table: MeetingTable;
  generatedAtLabel: string;
}

function MeetingsDocument({ table, generatedAtLabel }: MeetingsPdfProps) {
  // Beaucoup de colonnes (liste complète) : police plus petite pour tenir en largeur.
  const compact = table.header.length > 10;
  return (
    <Document title={table.title}>
      <Page
        size="A4"
        orientation="landscape"
        style={[styles.page, { fontSize: compact ? 6 : 8, padding: compact ? 20 : 28 }]}
      >
        <Text style={styles.title}>{table.title}</Text>
        <Text style={styles.subtitle}>
          {table.subtitle} — généré le {generatedAtLabel}
        </Text>

        {table.rows.length === 0 ? (
          <Text style={styles.empty}>Aucun rendez-vous pour ces critères.</Text>
        ) : (
          <>
            <View style={styles.headerRow} fixed>
              {table.header.map((label, i) => (
                <Text
                  key={label}
                  style={[
                    styles.headerCell,
                    { flex: table.columnFlex[i], padding: compact ? 3 : 5 },
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>
            {table.rows.map((row, r) => (
              <View key={r} style={styles.row} wrap={false}>
                {row.map((value, i) => (
                  <Text
                    key={i}
                    style={[styles.cell, { flex: table.columnFlex[i], padding: compact ? 3 : 5 }]}
                  >
                    {value}
                  </Text>
                ))}
              </View>
            ))}
          </>
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Document confidentiel — usage interne à l'organisation — page ${pageNumber}/${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderMeetingsPdf(props: MeetingsPdfProps): Promise<Buffer> {
  return renderToBuffer(<MeetingsDocument {...props} />);
}
