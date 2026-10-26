-- 26 oct. 2026 — Becom et CEO Summit ne font qu'un : tous les comptes
-- @ceo-summit.mg et @mg-becom.com rejoignent l'organisation du staff
-- (même règle que lib/staff-organization.ts::attachToStaffOrganization).
-- Le gérant d'une autre organisation la quitte s'il en est le seul membre
-- actif (elle perd son gérant) ; s'il y a d'autres membres, il n'est pas
-- déplacé. Sans organisation staff désignée, rien ne change.
WITH staff AS (
  SELECT "id" FROM "Company" WHERE "isStaffOrganization" LIMIT 1
),
targets AS (
  SELECT u."id"
  FROM "User" u
  WHERE (lower(u."email") LIKE '%@ceo-summit.mg' OR lower(u."email") LIKE '%@mg-becom.com')
    AND u."companyId" IS DISTINCT FROM (SELECT "id" FROM staff)
    AND NOT EXISTS (
      SELECT 1
      FROM "Company" c
      JOIN "User" o ON o."companyId" = c."id" AND o."id" <> u."id" AND o."status" = 'ACTIVE'
      WHERE c."companyAdminId" = u."id" AND c."id" <> (SELECT "id" FROM staff)
    )
),
freed AS (
  UPDATE "Company" SET "companyAdminId" = NULL
  WHERE "companyAdminId" IN (SELECT "id" FROM targets)
    AND "id" <> (SELECT "id" FROM staff)
  RETURNING "id"
)
UPDATE "User" SET "companyId" = (SELECT "id" FROM staff)
WHERE "id" IN (SELECT "id" FROM targets);
