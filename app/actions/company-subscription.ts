"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { isKeyUnderPrefix } from "@/lib/r2";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  submitPaymentProofSchema,
  purchaseUpsellSeatsSchema,
  MAX_PAYMENT_AMOUNT,
} from "@/lib/validations/company-payment";
import { computeDueAmount, meetsMinParticipants } from "@/lib/company-payment-amount";
import { isUpsellEligible } from "@/lib/upsell-plans";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import AdminCompanyPaymentAlertEmail from "@/emails/admin-company-payment-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — choix d'une offre par l'admin
 * entreprise.
 *
 * RG-11 révisée (6 août 2026) — changer d'offre reste possible tant que
 * l'abonnement n'est pas `ACTIVE`, mais plus une fois une preuve soumise
 * (`PENDING_REVIEW`) : l'équipe CEO Summit est déjà en train de la valider,
 * un changement d'offre à ce stade créait une confusion sur ce qui est
 * réellement dû. L'entreprise doit attendre la décision (validée → `ACTIVE`,
 * rejetée → retour à `PENDING_PAYMENT`) avant de pouvoir changer d'offre.
 */
export async function selectPlan(companyId: string, planId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: { include: { plan: { include: { event: true } } } } },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut choisir une offre." };
  }

  const effectiveStatus = company.subscription
    ? computeEffectiveStatus(company.subscription.status, company.subscription.plan.event?.date)
    : null;
  // RG-12 — une souscription ACTIVE dont l'évènement est passé n'est plus
  // qu'un statut affiché : on la persiste en EXPIRED avant de continuer,
  // pour que ce constat ne dépende pas d'un autre point de lecture.
  if (effectiveStatus === "EXPIRED" && company.subscription!.status === "ACTIVE") {
    await prisma.companySubscription.update({
      where: { id: company.subscription!.id },
      data: { status: "EXPIRED" },
    });
  }
  if (effectiveStatus === "ACTIVE") {
    return {
      success: false,
      error: "Un abonnement actif existe déjà — contactez l'équipe CEO Summit pour en changer.",
    };
  }

  if (company.subscription?.status === "PENDING_REVIEW") {
    return {
      success: false,
      error:
        "Votre paiement est en cours de validation — attendez la décision de l'équipe CEO Summit avant de changer d'offre.",
    };
  }

  /**
   * Audit (25 septembre 2026) — mêmes conditions que `createCompanyAccount` :
   * une offre de sponsoring (`isSelfService: false`) ou une offre supplément
   * (`isUpsell`, ex. Executive Pass — vendue en plus d'un abonnement, jamais
   * seule) n'est pas une offre principale souscriptible ici.
   */
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive || !plan.isSelfService || plan.isUpsell) {
    return { success: false, error: "Offre invalide." };
  }

  /**
   * Audit (25 septembre 2026) — `extraSeats` remis à 0 : changer d'offre ou
   * renouveler après expiration (RG-12, seul chemin de renouvellement —
   * `submitPaymentProof` exige `PENDING_PAYMENT`) repart d'un abonnement
   * neuf ; les places achetées en supplément valaient pour l'offre et
   * l'édition précédentes, pas pour la suivante.
   */
  await prisma.companySubscription.upsert({
    where: { companyId },
    update: { planId, status: "PENDING_PAYMENT", declaredParticipants: null, extraSeats: 0 },
    create: { companyId, planId, status: "PENDING_PAYMENT" },
  });

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}

/** Upload de la preuve + soumission pour revue admin. */
export async function submitPaymentProof(
  companySubscriptionId: string,
  input: unknown
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const subscription = await prisma.companySubscription.findUnique({
    where: { id: companySubscriptionId },
    include: { company: true, plan: true },
  });
  if (!subscription) return { success: false, error: "Abonnement introuvable." };
  if (subscription.company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut soumettre un paiement." };
  }
  if (subscription.status !== "PENDING_PAYMENT") {
    return {
      success: false,
      error: "Cet abonnement n'est pas en attente de paiement.",
    };
  }

  const parsed = submitPaymentProofSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  /**
   * Correctif (7 août 2026, audit) — `proofFileKey` n'était jamais vérifié
   * comme appartenant à l'appelant avant d'être résolu en URL signée côté
   * admin (`getSignedDownloadUrl`, qui ne porte lui-même aucune
   * autorisation — voir lib/r2.ts). `/api/company/payment-proof` préfixe
   * toujours ses clés par `company-payments/<uploaderId>/` ; seul ce
   * préfixe pour l'appelant courant est désormais accepté, ce qui empêche
   * de faire enregistrer par cette action une clé appartenant à quelqu'un
   * d'autre (preuve d'une autre entreprise, pièce jointe d'un tout autre
   * usage du bucket).
   */
  if (!isKeyUnderPrefix(f.proofFileKey, `company-payments/${viewer.id}/`)) {
    return { success: false, error: "Preuve de paiement invalide." };
  }

  /**
   * 22 septembre 2026 (`conception/12`) — seule une offre groupement
   * (`PER_PARTICIPANT`) demande un effectif au paiement, parce que son prix
   * en dépend. Une offre forfaitaire ne demande rien : son nombre de places
   * est fixé par l'admin sur l'offre, et l'entreprise désigne *qui*
   * participe plus tard, depuis son espace.
   */
  const isGroupOffer = subscription.plan.pricingMode === "PER_PARTICIPANT";
  if (isGroupOffer && !f.declaredParticipants) {
    return { success: false, error: "L'effectif de votre groupe est requis pour cette offre." };
  }
  const declaredParticipants = isGroupOffer ? f.declaredParticipants! : 1;

  if (!meetsMinParticipants(subscription.plan, declaredParticipants)) {
    const missing = (subscription.plan.minParticipants ?? 1) - declaredParticipants;
    return {
      success: false,
      error: `Cette offre démarre à ${subscription.plan.minParticipants} participants — il en manque ${missing}.`,
    };
  }
  const amount = computeDueAmount(subscription.plan, declaredParticipants);
  if (amount > MAX_PAYMENT_AMOUNT) {
    return {
      success: false,
      error:
        "Montant trop élevé pour un seul paiement — vérifiez l'effectif déclaré ou contactez l'équipe CEO Summit.",
    };
  }

  await prisma.$transaction([
    prisma.companyPayment.create({
      data: {
        companySubscriptionId,
        amount,
        method: f.method,
        proofFileKey: f.proofFileKey,
        comment: f.comment || null,
        submittedById: viewer.id,
      },
    }),
    prisma.companySubscription.update({
      where: { id: companySubscriptionId },
      data: {
        status: "PENDING_REVIEW",
        declaredParticipants: isGroupOffer ? declaredParticipants : null,
      },
    }),
  ]);

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Paiement entreprise à valider — ${subscription.company.name}`,
        react: AdminCompanyPaymentAlertEmail({
          companyName: subscription.company.name,
          amount,
          method: f.method,
        }),
      });
    } catch (err) {
      // Le paiement est déjà enregistré à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer l'action (même bug de
      // classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[submitPaymentProof] failed to send admin alert email", err);
    }
  }

  revalidatePath(`/entreprises/${subscription.companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}

/**
 * 22 septembre 2026 (`conception/12` §3.2) — achat d'un supplément de
 * participants (offre `isUpsell`, ex. Executive Pass = +1 place), en plus
 * d'un abonnement déjà actif. Délibérément séparé de `submitPaymentProof` :
 * ne touche jamais `CompanySubscription.status` (l'entreprise garde son
 * accès pendant la revue) — seule la confirmation admin incrémente
 * `extraSeats` (voir `lib/payment-confirmations.ts`).
 */
export async function purchaseUpsellSeats(
  companySubscriptionId: string,
  input: unknown
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const subscription = await prisma.companySubscription.findUnique({
    where: { id: companySubscriptionId },
    include: { company: true, plan: { include: { event: { select: { date: true } } } } },
  });
  if (!subscription) return { success: false, error: "Abonnement introuvable." };
  if (subscription.company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut acheter un supplément." };
  }

  const effectiveStatus = computeEffectiveStatus(
    subscription.status,
    subscription.plan.event?.date
  );
  // Audit (25 septembre 2026) — plus `EXPIRED` : des places ajoutées à une
  // édition passée ne servent à rien (et `selectPlan` les remet à 0 au
  // renouvellement).
  if (effectiveStatus !== "ACTIVE") {
    return {
      success: false,
      error: "Un abonnement actif est requis pour acheter des places supplémentaires.",
    };
  }

  // Audit (25 septembre 2026) — un seul supplément en attente à la fois :
  // deux preuves soumises en parallèle risquaient d'être validées deux fois
  // pour un seul virement. La page Gestion affiche le supplément en attente
  // à la place du formulaire.
  const pendingUpsell = await prisma.companyPayment.findFirst({
    where: { companySubscriptionId, status: "PENDING", upsellQuantity: { not: null } },
  });
  if (pendingUpsell) {
    return {
      success: false,
      error: `Un supplément de ${pendingUpsell.upsellQuantity} place(s) est déjà en attente de validation — attendez la décision de l'équipe CEO Summit avant d'en acheter un autre.`,
    };
  }

  const parsed = purchaseUpsellSeatsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  if (!isKeyUnderPrefix(f.proofFileKey, `company-payments/${viewer.id}/`)) {
    return { success: false, error: "Preuve de paiement invalide." };
  }

  const upsellPlan = await prisma.plan.findUnique({ where: { id: f.upsellPlanId } });
  if (!upsellPlan || !upsellPlan.isActive || !isUpsellEligible(upsellPlan)) {
    return { success: false, error: "Offre supplément invalide." };
  }
  // Un supplément Groupement (ex-ante minParticipants) garde son seuil même
  // acheté en supplément — acheter 1 place d'un lot pensé pour 10 n'a pas de
  // sens (voir meetsMinParticipants, même règle qu'à la souscription initiale).
  if (!meetsMinParticipants(upsellPlan, f.quantity)) {
    return {
      success: false,
      error: `Cette offre démarre à ${upsellPlan.minParticipants} place(s) — indiquez au moins ce nombre.`,
    };
  }

  const amount = upsellPlan.priceAr * f.quantity;
  // `CompanyPayment.amount` est un `Int` (int4 PostgreSQL) : au-delà, la
  // création échouait en 500.
  if (amount > MAX_PAYMENT_AMOUNT) {
    return {
      success: false,
      error:
        "Montant trop élevé pour un seul paiement — réduisez la quantité ou contactez l'équipe CEO Summit.",
    };
  }

  await prisma.companyPayment.create({
    data: {
      companySubscriptionId,
      amount,
      method: f.method,
      proofFileKey: f.proofFileKey,
      comment: f.comment || null,
      submittedById: viewer.id,
      upsellPlanId: upsellPlan.id,
      upsellQuantity: f.quantity,
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Supplément de participants à valider — ${subscription.company.name}`,
        react: AdminCompanyPaymentAlertEmail({
          companyName: subscription.company.name,
          amount,
          method: f.method,
        }),
      });
    } catch (err) {
      console.error("[purchaseUpsellSeats] failed to send admin alert email", err);
    }
  }

  revalidatePath(`/entreprises/${subscription.companyId}`);
  return { success: true, data: undefined };
}
