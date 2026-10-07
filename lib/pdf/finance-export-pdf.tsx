import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

import type { FinanceExportTable } from "@/lib/finance-export";

/**
 * Rapport QA du 7 oct. 2026 (§4.2) — export comptable en PDF : même contenu
 * que le CSV (buildFinanceExportTable), mis en page en A4 paysage.
 */

const NAVY = "#1A2B5F";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

/** Largeurs relatives des colonnes, dans l'ordre de FINANCE_EXPORT_HEADER. */
const COLUMN_FLEX = [2.0, 1.0, 2.4, 1.1, 1.3, 0.9, 0.8, 1.2, 1.3];
/** Colonnes de montants, alignées à droite. */
const NUMERIC_COLUMNS = new Set([3, 4, 5]);

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#1A1A1A" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 3, marginBottom: 14 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  headerRow: { flexDirection: "row", backgroundColor: NAVY },
  headerCell: { padding: 5, color: "#FFFFFF", fontFamily: "Helvetica-Bold" },
  cell: { padding: 5 },
  totalRow: { flexDirection: "row", marginTop: 6 },
  totalCell: { padding: 5, fontFamily: "Helvetica-Bold" },
  note: { marginTop: 12, fontSize: 8, color: MUTED },
  empty: { marginTop: 20, fontSize: 10, color: MUTED },
});

function cellStyle(index: number) {
  return {
    flex: COLUMN_FLEX[index],
    textAlign: NUMERIC_COLUMNS.has(index) ? "right" : "left",
  } as const;
}

function formatThousands(value: string): string {
  const [integer, decimals] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decimals ? `${grouped},${decimals}` : grouped;
}

export interface FinanceExportPdfProps {
  table: FinanceExportTable;
  generatedAtLabel: string;
}

function FinanceExportDocument({ table, generatedAtLabel }: FinanceExportPdfProps) {
  return (
    <Document title="Export comptable CEO Summit">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Export comptable CEO Summit</Text>
        <Text style={styles.subtitle}>
          Paiements confirmés — généré le {generatedAtLabel} — {table.rows.length} ligne(s)
        </Text>

        {table.rows.length === 0 ? (
          <Text style={styles.empty}>Aucun paiement confirmé.</Text>
        ) : (
          <>
            <View style={styles.headerRow} fixed>
              {table.header.map((label, i) => (
                <Text key={label} style={[styles.headerCell, cellStyle(i)]}>
                  {label}
                </Text>
              ))}
            </View>
            {table.rows.map((row, r) => (
              <View key={r} style={styles.row} wrap={false}>
                {row.map((value, i) => (
                  <Text key={i} style={[styles.cell, cellStyle(i)]}>
                    {i === 3 || i === 4 || i === 5 ? formatThousands(value) : value}
                  </Text>
                ))}
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text
                style={[
                  styles.totalCell,
                  { flex: COLUMN_FLEX[0] + COLUMN_FLEX[1] + COLUMN_FLEX[2] },
                ]}
              >
                Total
              </Text>
              <Text style={[styles.totalCell, cellStyle(3)]}>
                {formatThousands(table.totalEur.toFixed(2))}
              </Text>
              <Text style={[styles.totalCell, cellStyle(4)]}>
                {formatThousands(String(table.totalAr))}
              </Text>
              <Text
                style={{ flex: COLUMN_FLEX[5] + COLUMN_FLEX[6] + COLUMN_FLEX[7] + COLUMN_FLEX[8] }}
              />
            </View>
          </>
        )}

        <Text style={styles.note}>
          {
            "Montants en euros : prix officiel de l'offre ; à défaut (événements), montant en Ariary converti au taux du paiement. Le montant en Ariary est celui payé."
          }
          {table.hasEstimatedRate
            ? " Taux estimé : taux non enregistré au paiement, remplacé par le taux du jour de l'export."
            : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderFinanceExportPdf(props: FinanceExportPdfProps): Promise<Buffer> {
  return renderToBuffer(<FinanceExportDocument {...props} />);
}
