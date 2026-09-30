-- Rapport QA du 30 septembre 2026 — budget optionnel en euros pour une
-- opportunité Deal Room, même logique que Plan.priceEur/priceAr : `budget`
-- (Ariary) reste l'unique valeur utilisée pour le filtre/tri, `budgetEur`
-- n'est qu'informatif pour l'affichage "≈ X Ar".
ALTER TABLE "Opportunity" ADD COLUMN "budgetEur" INTEGER;
