-- Rapport QA du 7 oct. 2026 (§4.2) : taux EUR→Ar enregistré au moment du paiement.
ALTER TABLE "CompanyPayment" ADD COLUMN "eurToArRate" DOUBLE PRECISION;
ALTER TABLE "EventRegistration" ADD COLUMN "eurToArRate" DOUBLE PRECISION;
