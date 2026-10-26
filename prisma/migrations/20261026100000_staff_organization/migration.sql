-- 26 oct. 2026 — organisation unique du staff CEO Summit.
ALTER TABLE "Company" ADD COLUMN "isStaffOrganization" BOOLEAN NOT NULL DEFAULT false;

-- Une seule organisation staff.
CREATE UNIQUE INDEX "Company_single_staff_organization" ON "Company" ("isStaffOrganization")
  WHERE "isStaffOrganization";

-- L'organisation « CEO Summit » gérée par un administrateur de la plateforme
-- devient l'organisation staff. Si aucune ne correspond, rien n'est fait :
-- elle se désigne ensuite depuis Admin › Paramètres › Administrateurs.
UPDATE "Company" SET "isStaffOrganization" = true
WHERE "id" = (
  SELECT c."id"
  FROM "Company" c
  JOIN "User" u ON u."id" = c."companyAdminId"
  WHERE lower(trim(c."name")) = 'ceo summit' AND u."isPlatformAdmin"
  ORDER BY c."createdAt"
  LIMIT 1
);
