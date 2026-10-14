/**
 * Dashboard "Profil complété" widget — percentage of the fields a member can
 * actually fill in from `/profil/editer` that are non-empty. Kept as a pure
 * function (same rationale as lib/events-query.ts) so the rule is testable
 * without touching Prisma.
 */

export interface ProfileCompletenessInput {
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  country: string | null;
  companyId: string | null;
  sectors: string[];
  /** Un administrateur n'a pas à être rattaché à une entreprise (14 oct. 2026). */
  isPlatformAdmin?: boolean;
}

const TRACKED_FIELDS = 9;

export function profileCompleteness(user: ProfileCompletenessInput): number {
  let filled = 0;
  if (user.title) filled++;
  if (user.bio) filled++;
  if (user.avatarUrl) filled++;
  if (user.websiteUrl) filled++;
  if (user.linkedinUrl) filled++;
  if (user.phone) filled++;
  if (user.country) filled++;
  if (user.companyId) filled++;
  if (user.sectors.length > 0) filled++;
  // Entreprise non comptée pour un administrateur qui n'en a pas.
  const tracked = user.isPlatformAdmin && !user.companyId ? TRACKED_FIELDS - 1 : TRACKED_FIELDS;
  return Math.round((filled / tracked) * 100);
}
