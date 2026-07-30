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
  linkedinUrl: string | null;
  phone: string | null;
  country: string | null;
  companyId: string | null;
  sectors: string[];
}

const TRACKED_FIELDS = 8;

export function profileCompleteness(user: ProfileCompletenessInput): number {
  let filled = 0;
  if (user.title) filled++;
  if (user.bio) filled++;
  if (user.avatarUrl) filled++;
  if (user.linkedinUrl) filled++;
  if (user.phone) filled++;
  if (user.country) filled++;
  if (user.companyId) filled++;
  if (user.sectors.length > 0) filled++;
  return Math.round((filled / TRACKED_FIELDS) * 100);
}
