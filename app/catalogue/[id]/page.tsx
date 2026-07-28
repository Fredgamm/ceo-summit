import { redirect } from "next/navigation";

/**
 * E2-T04 — "Fiche détail membre". Rather than duplicate the rich profile
 * view (tabs, self/other visibility rules, contextual actions), this route
 * just canonicalizes to /membres/[id], which E2-T01 already built to the
 * same wireframe (catalogue-fiche.html is the same member-profile concept).
 */
export default function CatalogueMemberRedirect({ params }: { params: { id: string } }) {
  redirect(`/membres/${params.id}`);
}
