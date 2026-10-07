import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { allowedVisibilities } from "@/lib/deal-room-query";
import { countUnreadMessages } from "@/lib/conversations";
import { getSignedDownloadUrl } from "@/lib/r2";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactPanel } from "@/components/deal-room/contact-panel";
import { ReceivedContactActions } from "@/components/deal-room/received-contact-actions";
import { WithdrawContactButton } from "@/components/deal-room/withdraw-contact-button";
import { formatAriary, formatEuro, formatDateFr, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Détail opportunité" };

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: params.id },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          title: true,
          avatarUrl: true,
          bio: true,
          ...VIEWER_TIER_INCLUDE,
        },
      },
      _count: { select: { contacts: true } },
    },
  });
  if (!opportunity) notFound();

  const viewerTier = getViewerTierFromCompany(viewer.company);
  const isAuthor = opportunity.authorId === viewer.id;

  // Defense in depth — the list already filters by visibility, but a
  // direct URL shouldn't bypass the tier gate.
  if (opportunity.status !== "PUBLISHED" && !isAuthor) notFound();
  if (!isAuthor && !allowedVisibilities(viewerTier).includes(opportunity.visibility)) notFound();

  const myContact = isAuthor
    ? null
    : await prisma.opportunityContact.findUnique({
        where: {
          opportunityId_initiatorId: { opportunityId: opportunity.id, initiatorId: viewer.id },
        },
      });

  const pendingReceivedContacts = isAuthor
    ? await prisma.opportunityContact.findMany({
        where: { opportunityId: opportunity.id, status: "PENDING" },
        include: { initiator: { select: { name: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const unreadMessages = await countUnreadMessages(viewer.id);

  // B4 (audit du 29 juillet 2026) — attachments are R2 keys in a private
  // bucket, resolved to short-lived signed URLs only after the visibility
  // gate above has already run, never exposed as permanent public links.
  const attachmentLinks = await Promise.all(
    opportunity.attachments.map(async (key) => ({
      key,
      name: key.split("/").pop() ?? key,
      url: await getSignedDownloadUrl(
        process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
        key
      ),
    }))
  );

  return (
    <AppShell
      user={{
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <Link href="/deal-room" className="mb-4 inline-block text-sm text-text-muted">
        ← Deal Room
      </Link>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{opportunity.type}</Badge>
        <Badge variant="secondary">{opportunity.sector}</Badge>
      </div>

      <h1 className="mb-3 mt-2 text-2xl font-bold text-navy">{opportunity.title}</h1>

      <div className="mb-6 flex flex-wrap gap-4 text-sm text-text-muted">
        <span>📍 {opportunity.country}</span>
        {opportunity.budget != null && <span>💰 Budget : {formatAriary(opportunity.budget)}</span>}
        {opportunity.budgetEur != null && <span>💶 {formatEuro(opportunity.budgetEur)}</span>}
        {opportunity.deadline && <span>📅 Échéance : {formatDateFr(opportunity.deadline)}</span>}
        <span>
          {opportunity._count.contacts} contact{opportunity._count.contacts !== 1 ? "s" : ""} reçu
          {opportunity._count.contacts !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-navy">
              Description de l&apos;opportunité
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-mid">
              {opportunity.description}
            </p>
          </div>

          {attachmentLinks.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">Pièces jointes</h2>
              <ul className="flex flex-col gap-2">
                {attachmentLinks.map((a) => (
                  <li key={a.key}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-navy-mid"
                    >
                      📄 {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-xs font-bold uppercase text-text-muted">Publié par</p>
            <Link
              href={`/membres/${opportunity.author.id}`}
              className="mb-4 flex items-center gap-3"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={opportunity.author.avatarUrl ?? undefined}
                  alt={opportunity.author.name}
                />
                <AvatarFallback>{initials(opportunity.author.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-navy">{opportunity.author.name}</p>
                <p className="text-xs text-text-muted">
                  {[opportunity.author.title, opportunity.author.company?.name]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </Link>

            {isAuthor ? (
              <>
                <p className="text-sm text-text-muted">C&apos;est votre opportunité.</p>
                {(opportunity.status === "REFUSED" ||
                  opportunity.status === "CHANGES_REQUESTED") && (
                  <Button asChild variant="outline" className="mt-3 w-full justify-center">
                    <Link href={`/deal-room/${opportunity.id}/modifier`}>
                      Modifier et soumettre à nouveau
                    </Link>
                  </Button>
                )}
              </>
            ) : myContact?.status === "ACCEPTED" ? (
              <Button asChild className="w-full justify-center">
                <Link href={`/messagerie/${myContact.conversationId}`}>Voir la conversation</Link>
              </Button>
            ) : myContact?.status === "PENDING" ? (
              <>
                <Badge variant="pending" className="w-full justify-center py-2">
                  En attente d&apos;acceptation
                </Badge>
                <WithdrawContactButton contactId={myContact.id} />
              </>
            ) : myContact?.status === "DECLINED" ? (
              <Badge variant="refused" className="w-full justify-center py-2">
                Demande refusée
              </Badge>
            ) : (
              <ContactPanel opportunityId={opportunity.id} authorName={opportunity.author.name} />
            )}
          </div>

          {isAuthor && pendingReceivedContacts.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-5">
              <p className="mb-3 text-xs font-bold uppercase text-text-muted">
                Demandes de contact reçues ({pendingReceivedContacts.length})
              </p>
              <div className="flex flex-col gap-3">
                {pendingReceivedContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={contact.initiator.avatarUrl ?? undefined}
                          alt={contact.initiator.name}
                        />
                        <AvatarFallback>{initials(contact.initiator.name)}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-semibold text-navy">{contact.initiator.name}</p>
                    </div>
                    <ReceivedContactActions contactId={contact.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
