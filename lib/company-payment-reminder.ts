/**
 * 29 oct. 2026 — action d'audit log d'une relance de paiement entreprise
 * (app/actions/admin-companies.ts::sendCompanyPaymentReminder), relue par la
 * page admin pour afficher la dernière relance. Hors du fichier "use server",
 * qui ne peut exporter que des fonctions.
 */
export const COMPANY_PAYMENT_REMINDER_ACTION = "company_payment.reminder";
