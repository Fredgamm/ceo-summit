import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateFr, initials, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Fiche service" };

/** E5-T02 — description, tarifs, galerie, contact contextuel vers la messagerie. */
export default async function ServiceDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const listing = await prisma.serviceListing.findUnique({
    where: { id: params.id },
    include: {
      author: {
        select: { id: true, name: true, title: true, avatarUrl: true, country: true },
      },
      company: { select: { name: true, country: true } },
    },
  });
  if (!listing) notFound();

  const isAuthor = listing.authorId === viewer.id;
  if (listing.status !== "PUBLISHED" && !isAuthor) notFound();

  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(getViewerTierFromCompany(viewer.company)),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <Link href="/catalogue/services" className="mb-4 inline-block text-sm text-text-muted">
        ← Catalogue de services
      </Link>

      <Badge variant="secondary">{listing.category}</Badge>
      <h1 className="mb-3 mt-2 text-2xl font-bold text-navy">{listing.title}</h1>

      <div className="mb-6 flex flex-wrap gap-4 text-sm text-text-muted">
        <span>Publié le {formatDateFr(listing.createdAt)}</span>
        {listing.priceInfo && <span>· Tarif : {listing.priceInfo}</span>}
        <span>· {listing.company?.country ?? listing.author.country ?? "—"}</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {listing.gallery.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {listing.gallery.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-32 w-full rounded-md object-cover" />
              ))}
            </div>
          )}

          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-navy">Description</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-mid">
              {listing.description}
            </p>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-xs font-bold uppercase text-text-muted">Proposé par</p>
            <Link href={`/membres/${listing.author.id}`} className="mb-4 flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={listing.author.avatarUrl ?? undefined}
                  alt={listing.author.name}
                />
                <AvatarFallback>{initials(listing.author.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-navy">{listing.author.name}</p>
                <p className="text-xs text-text-muted">
                  {[listing.author.title, listing.company?.name].filter(Boolean).join(" · ")}
                </p>
              </div>
            </Link>

            {isAuthor ? (
              <p className="text-sm text-text-muted">C&apos;est votre fiche.</p>
            ) : (
              <Button asChild className="w-full justify-center">
                <Link href={`/messagerie?new=${listing.author.id}`}>Contacter</Link>
              </Button>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
