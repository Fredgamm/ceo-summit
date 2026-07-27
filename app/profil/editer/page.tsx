import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Éditer mon profil" };

/**
 * E2-T02 — édition profil.
 */
export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!user) redirect("/login");

  const tierLabel = user.memberships[0]?.tier
    ? user.memberships[0].tier.charAt(0) + user.memberships[0].tier.slice(1).toLowerCase()
    : "Membre";

  return (
    <AppShell
      user={{
        name: user.name,
        tier: tierLabel,
        avatarUrl: user.avatarUrl,
        isAdmin: user.role === "ADMIN",
      }}
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
          initialLinkedinUrl={user.linkedinUrl ?? ""}
          initialCountry={user.country ?? ""}
          initialSectors={user.sectors}
          initialAvatarUrl={user.avatarUrl}
        />
      </div>
    </AppShell>
  );
}
