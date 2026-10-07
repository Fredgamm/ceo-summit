import { toEuroAmount, type FinanceTransaction } from "@/lib/finance";
import { formatDateFr } from "@/lib/utils";

const METHOD_LABEL: Record<string, string> = {
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  CARTE_BANCAIRE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  INCLUS: "Inclus",
};

const SOURCE_LABEL: Record<FinanceTransaction["source"], string> = {
  COMPANY: "Entreprise",
  EVENT: "Événement",
};

export const FINANCE_EXPORT_HEADER = [
  "Membre",
  "Source",
  "Description",
  "Montant (€)",
  "Montant (Ar)",
  "Taux (Ar/€)",
  "Taux estimé",
  "Méthode",
  "Date",
];

export interface FinanceExportTable {
  header: string[];
  rows: string[][];
  totalEur: number;
  totalAr: number;
  /** Au moins une ligne convertie au taux du jour faute de taux enregistré. */
  hasEstimatedRate: boolean;
}

/**
 * Rapport QA du 7 oct. 2026 (§4.2) — contenu de l'export comptable, commun au
 * CSV et au PDF : euros d'abord, au taux du moment du paiement, puis le
 * montant en Ariary. Lignes les plus récentes en premier.
 */
export function buildFinanceExportTable(
  transactions: FinanceTransaction[],
  fallbackRate: number
): FinanceExportTable {
  const sorted = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime());
  let totalEur = 0;
  let totalAr = 0;
  let hasEstimatedRate = false;

  const rows = sorted.map((t) => {
    const euro = toEuroAmount(t, fallbackRate);
    totalEur += euro.amountEur;
    totalAr += t.amount;
    hasEstimatedRate ||= euro.rateEstimated;
    return [
      t.memberName,
      SOURCE_LABEL[t.source],
      t.description,
      euro.amountEur.toFixed(2),
      String(t.amount),
      euro.rate.toFixed(2),
      euro.rateEstimated ? "Oui" : "Non",
      METHOD_LABEL[t.method] ?? t.method,
      formatDateFr(t.date),
    ];
  });

  return {
    header: FINANCE_EXPORT_HEADER,
    rows,
    totalEur: Math.round(totalEur * 100) / 100,
    totalAr,
    hasEstimatedRate,
  };
}
