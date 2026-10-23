-- 23 oct. 2026 — envois à Evolia retenus tant que la clé de production n'est
-- pas validée (lib/evolia.ts), puis transmis ou écartés à l'activation.
ALTER TYPE "EvoliaPushStatus" ADD VALUE 'HELD';
ALTER TYPE "EvoliaPushStatus" ADD VALUE 'SKIPPED';
