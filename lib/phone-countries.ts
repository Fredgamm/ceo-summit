/**
 * 5 nov. 2026 — indicatifs téléphoniques pour le champ « Téléphone » de
 * l'inscription. Les pays de l'océan Indien d'abord (public principal), puis
 * le reste par ordre alphabétique. `name` reprend l'orthographe du
 * référentiel des pays (lib/referential-catalog.ts) pour proposer
 * automatiquement l'indicatif du pays choisi pour l'organisation.
 */
export interface PhoneCountry {
  /** Code ISO 3166-1 alpha-2, unique : sert de valeur du sélecteur. */
  iso: string;
  name: string;
  dial: string;
}

export const PRIORITY_PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "MG", name: "Madagascar", dial: "+261" },
  { iso: "MU", name: "Île Maurice", dial: "+230" },
  { iso: "RE", name: "La Réunion", dial: "+262" },
  { iso: "YT", name: "Mayotte", dial: "+262" },
  { iso: "KM", name: "Comores", dial: "+269" },
  { iso: "SC", name: "Seychelles", dial: "+248" },
  { iso: "FR", name: "France", dial: "+33" },
];

const OTHER_PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "ZA", name: "Afrique du Sud", dial: "+27" },
  { iso: "DZ", name: "Algérie", dial: "+213" },
  { iso: "DE", name: "Allemagne", dial: "+49" },
  { iso: "AO", name: "Angola", dial: "+244" },
  { iso: "SA", name: "Arabie saoudite", dial: "+966" },
  { iso: "AR", name: "Argentine", dial: "+54" },
  { iso: "AU", name: "Australie", dial: "+61" },
  { iso: "AT", name: "Autriche", dial: "+43" },
  { iso: "BH", name: "Bahreïn", dial: "+973" },
  { iso: "BD", name: "Bangladesh", dial: "+880" },
  { iso: "BE", name: "Belgique", dial: "+32" },
  { iso: "BJ", name: "Bénin", dial: "+229" },
  { iso: "BW", name: "Botswana", dial: "+267" },
  { iso: "BR", name: "Brésil", dial: "+55" },
  { iso: "BF", name: "Burkina Faso", dial: "+226" },
  { iso: "BI", name: "Burundi", dial: "+257" },
  { iso: "CM", name: "Cameroun", dial: "+237" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "CV", name: "Cap-Vert", dial: "+238" },
  { iso: "CN", name: "Chine", dial: "+86" },
  { iso: "CY", name: "Chypre", dial: "+357" },
  { iso: "CG", name: "Congo", dial: "+242" },
  { iso: "KR", name: "Corée du Sud", dial: "+82" },
  { iso: "CI", name: "Côte d'Ivoire", dial: "+225" },
  { iso: "HR", name: "Croatie", dial: "+385" },
  { iso: "DK", name: "Danemark", dial: "+45" },
  { iso: "DJ", name: "Djibouti", dial: "+253" },
  { iso: "EG", name: "Égypte", dial: "+20" },
  { iso: "AE", name: "Émirats arabes unis", dial: "+971" },
  { iso: "ES", name: "Espagne", dial: "+34" },
  { iso: "EE", name: "Estonie", dial: "+372" },
  { iso: "SZ", name: "Eswatini", dial: "+268" },
  { iso: "US", name: "États-Unis", dial: "+1" },
  { iso: "ET", name: "Éthiopie", dial: "+251" },
  { iso: "FI", name: "Finlande", dial: "+358" },
  { iso: "GA", name: "Gabon", dial: "+241" },
  { iso: "GM", name: "Gambie", dial: "+220" },
  { iso: "GH", name: "Ghana", dial: "+233" },
  { iso: "GR", name: "Grèce", dial: "+30" },
  { iso: "GN", name: "Guinée", dial: "+224" },
  { iso: "GQ", name: "Guinée équatoriale", dial: "+240" },
  { iso: "GW", name: "Guinée-Bissau", dial: "+245" },
  { iso: "HU", name: "Hongrie", dial: "+36" },
  { iso: "IN", name: "Inde", dial: "+91" },
  { iso: "ID", name: "Indonésie", dial: "+62" },
  { iso: "IE", name: "Irlande", dial: "+353" },
  { iso: "IL", name: "Israël", dial: "+972" },
  { iso: "IT", name: "Italie", dial: "+39" },
  { iso: "JP", name: "Japon", dial: "+81" },
  { iso: "JO", name: "Jordanie", dial: "+962" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "KW", name: "Koweït", dial: "+965" },
  { iso: "LS", name: "Lesotho", dial: "+266" },
  { iso: "LB", name: "Liban", dial: "+961" },
  { iso: "LR", name: "Liberia", dial: "+231" },
  { iso: "LY", name: "Libye", dial: "+218" },
  { iso: "LU", name: "Luxembourg", dial: "+352" },
  { iso: "MY", name: "Malaisie", dial: "+60" },
  { iso: "MW", name: "Malawi", dial: "+265" },
  { iso: "MV", name: "Maldives", dial: "+960" },
  { iso: "ML", name: "Mali", dial: "+223" },
  { iso: "MT", name: "Malte", dial: "+356" },
  { iso: "MA", name: "Maroc", dial: "+212" },
  { iso: "MR", name: "Mauritanie", dial: "+222" },
  { iso: "MX", name: "Mexique", dial: "+52" },
  { iso: "MC", name: "Monaco", dial: "+377" },
  { iso: "MZ", name: "Mozambique", dial: "+258" },
  { iso: "NA", name: "Namibie", dial: "+264" },
  { iso: "NE", name: "Niger", dial: "+227" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "NO", name: "Norvège", dial: "+47" },
  { iso: "NZ", name: "Nouvelle-Zélande", dial: "+64" },
  { iso: "OM", name: "Oman", dial: "+968" },
  { iso: "UG", name: "Ouganda", dial: "+256" },
  { iso: "PK", name: "Pakistan", dial: "+92" },
  { iso: "NL", name: "Pays-Bas", dial: "+31" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "PL", name: "Pologne", dial: "+48" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "QA", name: "Qatar", dial: "+974" },
  { iso: "CF", name: "République centrafricaine", dial: "+236" },
  { iso: "CD", name: "République démocratique du Congo", dial: "+243" },
  { iso: "CZ", name: "République tchèque", dial: "+420" },
  { iso: "RO", name: "Roumanie", dial: "+40" },
  { iso: "GB", name: "Royaume-Uni", dial: "+44" },
  { iso: "RU", name: "Russie", dial: "+7" },
  { iso: "RW", name: "Rwanda", dial: "+250" },
  { iso: "ST", name: "Sao Tomé-et-Principe", dial: "+239" },
  { iso: "SN", name: "Sénégal", dial: "+221" },
  { iso: "SL", name: "Sierra Leone", dial: "+232" },
  { iso: "SG", name: "Singapour", dial: "+65" },
  { iso: "SO", name: "Somalie", dial: "+252" },
  { iso: "SD", name: "Soudan", dial: "+249" },
  { iso: "SS", name: "Soudan du Sud", dial: "+211" },
  { iso: "LK", name: "Sri Lanka", dial: "+94" },
  { iso: "SE", name: "Suède", dial: "+46" },
  { iso: "CH", name: "Suisse", dial: "+41" },
  { iso: "TZ", name: "Tanzanie", dial: "+255" },
  { iso: "TD", name: "Tchad", dial: "+235" },
  { iso: "TH", name: "Thaïlande", dial: "+66" },
  { iso: "TG", name: "Togo", dial: "+228" },
  { iso: "TN", name: "Tunisie", dial: "+216" },
  { iso: "TR", name: "Turquie", dial: "+90" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
  { iso: "VN", name: "Viêt Nam", dial: "+84" },
  { iso: "ZM", name: "Zambie", dial: "+260" },
  { iso: "ZW", name: "Zimbabwe", dial: "+263" },
];

export const PHONE_COUNTRIES: PhoneCountry[] = [
  ...PRIORITY_PHONE_COUNTRIES,
  ...OTHER_PHONE_COUNTRIES,
];

export const DEFAULT_PHONE_COUNTRY = "MG";

export function phoneCountryByIso(iso: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((c) => c.iso === iso);
}

/** Pays du référentiel (« Île Maurice ») → entrée d'indicatif, si connue. */
export function phoneCountryByName(name: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((c) => c.name === name);
}

/**
 * Numéro complet enregistré : « +261 34 12 345 67 ». Le 0 de tête du numéro
 * national est retiré (« 034… » → « +261 34… »), espaces normalisés.
 */
export function formatInternationalPhone(dial: string, national: string): string {
  const cleaned = national.replace(/\s+/g, " ").trim().replace(/^0+/, "");
  return cleaned ? `${dial} ${cleaned}` : "";
}
