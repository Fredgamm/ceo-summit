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
export default async function MyProfilePage({
  searchParams,
}: {
  searchParams?: { onglet?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <MemberProfilePage params={{ id: session.user.id }} searchParams={searchParams} />;
}
