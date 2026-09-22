import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { Button } from "@/components/ui/button";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Éditer mon profil" };

/**
 * E2-T02 — édition profil.
 */
export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!user) redirect("/login");

  const [unreadMessages, availableCountries, availableSectors] = await Promise.all([
    countUnreadMessages(user.id),
    getReferentialLabels("country"),
    getReferentialLabels("sector"),
  ]);

  return (
    <AppShell
      user={{
        name: user.name,
        tier: tierLabel(getViewerTierFromCompany(user.company)),
        avatarUrl: user.avatarUrl,
        isAdmin: user.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Éditer mon profil</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/membres/${user.id}`}>Aperçu public</Link>
        </Button>
      </div>

      <div className="max-w-[640px]">
        <ProfileEditForm
          userId={user.id}
          initialName={user.name}
          initialTitle={user.title ?? ""}
          initialBio={user.bio ?? ""}
          initialWebsiteUrl={user.websiteUrl ?? ""}
          initialLinkedinUrl={user.linkedinUrl ?? ""}
          initialCountry={user.country ?? ""}
          initialSectors={user.sectors}
          initialAvatarUrl={user.avatarUrl}
          initialPhone={user.phone ?? ""}
          availableCountries={availableCountries}
          availableSectors={availableSectors}
        />
      </div>
    </AppShell>
  );
}
