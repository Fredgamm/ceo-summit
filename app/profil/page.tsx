import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import MemberProfilePage from "@/app/membres/[id]/page";

export const metadata: Metadata = { title: "Mon profil" };

/**
 * Rapport QA du 7 oct. 2026 (§3) — « Mon profil » ouvre le profil du membre
 * connecté, tel que les autres le voient, avec en plus sa complétion, ses
 * coordonnées et ses contenus non publiés. L'édition reste sur /profil/editer.
 */
export default async function MyProfilePage(props: { searchParams: Promise<{ onglet?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Next 15 — la page membre attend des `params`/`searchParams` asynchrones.
  return (
    <MemberProfilePage
      params={Promise.resolve({ id: session.user.id })}
      searchParams={props.searchParams}
    />
  );
}
