import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getReferentialLabels } from "@/lib/referentials-query";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { OnboardingHeader } from "@/components/onboarding/onboarding-header";

export const metadata: Metadata = { title: "Bienvenue" };

/**
 * E1-T05 — reached after account activation (see set-password-form.tsx).
 * Ref: conception/01_onboarding_acces.md UC-05 + Écran 07 (US-010/US-011).
 *
 * Guards against the tutorial re-triggering on later logins (US-010
 * acceptance: "ne se re-déclenche pas aux connexions suivantes") by
 * redirecting straight to /dashboard once onboardingCompletedAt is set.
 */
export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  if (user.onboardingCompletedAt) redirect("/dashboard");

  const availableSectors = await getReferentialLabels("sector");

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface">
      <OnboardingHeader />
      <div className="flex w-full flex-1 items-center justify-center p-6">
        <OnboardingWizard
          firstName={user.name.split(" ")[0]}
          initialTitle={user.title ?? ""}
          initialBio={user.bio ?? ""}
          initialSectors={user.sectors}
          availableSectors={availableSectors}
        />
      </div>
    </div>
  );
}
