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
import { computeDueAmount, meetsMinParticipants, unitPriceAr } from "@/lib/company-payment-amount";
import { isUpsellEligible } from "@/lib/upsell-plans";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import { resolveEmail } from "@/lib/email-template-resolver";
import { getEurToArRate } from "@/lib/currency-conversion";
import {
  CANCELLED_BY_COMPANY_REASON,
  EVOLIA_CANCEL_DELAY_MS,
  isEvoliaPaymentMethod,
} from "@/lib/payment-methods";
import { evoliaPaymentUrl, pushRegistrationToEvolia } from "@/lib/evolia";
import { formatEuro } from "@/lib/utils";
import { PLATFORM_ADMIN_NO_PURCHASE_MESSAGE } from "@/lib/platform-admin-purchase";

/** 14 oct. 2026 — pas de paiement sans adresse confirmée (lib/email-verification.ts). */
const EMAIL_NOT_VERIFIED_MESSAGE =
  "Confirmez d'abord votre adresse e-mail avec le lien reçu après l'inscription.";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Migration bibliothèque d'emails éditable (25 septembre 2026) — reprend
 * exactement le formatage de l'ancien composant `emails/admin-company-payment-alert-email.tsx`
 * (retiré), pour que le registre reçoive un montant et une méthode déjà
 * formatés en chaînes lisibles.
 */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  VIREMENT: "virement bancaire",
  CHEQUE: "chèque",
  CARTE_BANCAIRE: "carte bancaire",
  MOBILE_MONEY: "mobile money",
};
function formatPaymentAmountAr(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} Ar`;
}

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
  if (viewer.isPlatformAdmin) return { success: false, error: PLATFORM_ADMIN_NO_PURCHASE_MESSAGE };

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
    update: {
      planId,
      status: "PENDING_PAYMENT",
      declaredParticipants: null,
      extraSeats: 0,
      unlimitedSeats: false,
    },
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
): Promise<ActionResult<PaymentSubmission>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (viewer.isPlatformAdmin) return { success: false, error: PLATFORM_ADMIN_NO_PURCHASE_MESSAGE };
  if (!viewer.emailVerifiedAt) return { success: false, error: EMAIL_NOT_VERIFIED_MESSAGE };

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
  const viaEvolia = isEvoliaPaymentMethod(f.method);
  if (!viaEvolia && !isKeyUnderPrefix(f.proofFileKey, `company-payments/${viewer.id}/`)) {
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
  // 12 oct. 2026 — montant au cours du jour pour une offre cotée en euros.
  const eurToArRate = await getEurToArRate();
  const amount = computeDueAmount(subscription.plan, declaredParticipants, eurToArRate);
  if (amount > MAX_PAYMENT_AMOUNT) {
    return {
      success: false,
      error:
        "Montant trop élevé pour un seul paiement — vérifiez l'effectif déclaré ou contactez l'équipe CEO Summit.",
    };
  }

  // Rapport QA du 7 oct. 2026 (§4.2) — taux du jour enregistré avec le
  // paiement, pour l'export en euros.
  const [payment] = await prisma.$transaction([
    prisma.companyPayment.create({
      data: {
        companySubscriptionId,
        amount,
        eurToArRate,
        method: f.method,
        proofFileKey: viaEvolia ? "" : f.proofFileKey,
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

  if (viaEvolia) {
    const started = await startEvoliaCollection(payment.id, viewer.id, true);
    revalidatePath(`/entreprises/${subscription.companyId}`);
    revalidatePath("/entreprise/paiement");
    return started;
  }

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      const email = await resolveEmail("admin-company-payment-alert", {
        companyName: subscription.company.name,
        amount: formatPaymentAmountAr(amount),
        method: PAYMENT_METHOD_LABEL[f.method] ?? f.method,
      });
      if (email) await sendTransactionalEmail({ to: process.env.ADMIN_ALERT_EMAIL, ...email });
    } catch (err) {
      // Le paiement est déjà enregistré à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer l'action (même bug de
      // classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[submitPaymentProof] failed to send admin alert email", err);
    }
  }

  // 12 oct. 2026 — le gérant est prévenu que son paiement est reçu et en cours
  // de vérification ; l'e-mail « paiement confirmé » suivra la validation.
  try {
    const amountEur =
      subscription.plan.priceEur != null
        ? subscription.plan.priceEur * declaredParticipants
        : Math.round(amount / eurToArRate);
    const email = await resolveEmail("company-payment-received", {
      adminName: viewer.name,
      companyName: subscription.company.name,
      amount: `${formatEuro(amountEur)} (soit ${formatPaymentAmountAr(amount)})`,
      method: PAYMENT_METHOD_LABEL[f.method] ?? f.method,
    });
    if (email) await sendTransactionalEmail({ to: viewer.email, ...email });
  } catch (err) {
    console.error("[submitPaymentProof] failed to send payment received email", err);
  }

  revalidatePath(`/entreprises/${subscription.companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: { redirectUrl: null } };
}

/** Après l'enregistrement d'un paiement : où envoyer le gérant (page de paiement Evolia, ou nulle part). */
type PaymentSubmission = { redirectUrl: string | null };

const EVOLIA_UNAVAILABLE_MESSAGE =
  "Le paiement par carte ou Mobile Money est momentanément indisponible. Réessayez dans quelques minutes, ou réglez par virement bancaire.";

/**
 * Intégration Evolia (8 oct. 2026, conception/11 §3) — carte et Mobile
 * Money : l'inscription est transmise à Evolia, puis le gérant est redirigé
 * vers leur page de paiement ; Evolia confirme ensuite sur notre webhook
 * (app/api/webhooks/payments). Si Evolia ne reçoit pas l'inscription, rien
 * ne pourrait être encaissé : le paiement est annulé (et l'abonnement repasse
 * en attente de paiement pour une offre initiale) plutôt que de rester bloqué
 * en revue.
 */
async function startEvoliaCollection(
  paymentId: string,
  viewerId: string,
  revertSubscription: boolean
): Promise<ActionResult<PaymentSubmission>> {
  if (await pushRegistrationToEvolia(paymentId)) {
    return { success: true, data: { redirectUrl: await evoliaPaymentUrl(paymentId) } };
  }
  const payment = await prisma.companyPayment.update({
    where: { id: paymentId },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      rejectionReason: "Transmission à Evolia impossible — paiement non lancé.",
    },
  });
  if (revertSubscription) {
    await prisma.companySubscription.update({
      where: { id: payment.companySubscriptionId },
      data: { status: "PENDING_PAYMENT" },
    });
  }
  console.error(
    `[startEvoliaCollection] push refused for payment ${paymentId} (viewer ${viewerId})`
  );
  return { success: false, error: EVOLIA_UNAVAILABLE_MESSAGE };
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
): Promise<ActionResult<PaymentSubmission>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (viewer.isPlatformAdmin) return { success: false, error: PLATFORM_ADMIN_NO_PURCHASE_MESSAGE };
  if (!viewer.emailVerifiedAt) return { success: false, error: EMAIL_NOT_VERIFIED_MESSAGE };

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

  const viaEvolia = isEvoliaPaymentMethod(f.method);
  if (!viaEvolia && !isKeyUnderPrefix(f.proofFileKey, `company-payments/${viewer.id}/`)) {
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

  const eurToArRate = await getEurToArRate();
  const amount = unitPriceAr(upsellPlan, eurToArRate) * f.quantity;
  // `CompanyPayment.amount` est un `Int` (int4 PostgreSQL) : au-delà, la
  // création échouait en 500.
  if (amount > MAX_PAYMENT_AMOUNT) {
    return {
      success: false,
      error:
        "Montant trop élevé pour un seul paiement — réduisez la quantité ou contactez l'équipe CEO Summit.",
    };
  }

  const payment = await prisma.companyPayment.create({
    data: {
      companySubscriptionId,
      amount,
      eurToArRate,
      method: f.method,
      proofFileKey: viaEvolia ? "" : f.proofFileKey,
      comment: f.comment || null,
      submittedById: viewer.id,
      upsellPlanId: upsellPlan.id,
      upsellQuantity: f.quantity,
    },
  });

  if (viaEvolia) {
    const started = await startEvoliaCollection(payment.id, viewer.id, false);
    revalidatePath(`/entreprises/${subscription.companyId}`);
    return started;
  }

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      const email = await resolveEmail("admin-company-payment-alert", {
        companyName: subscription.company.name,
        amount: formatPaymentAmountAr(amount),
        method: PAYMENT_METHOD_LABEL[f.method] ?? f.method,
      });
      if (email) await sendTransactionalEmail({ to: process.env.ADMIN_ALERT_EMAIL, ...email });
    } catch (err) {
      console.error("[purchaseUpsellSeats] failed to send admin alert email", err);
    }
  }

  revalidatePath(`/entreprises/${subscription.companyId}`);
  return { success: true, data: { redirectUrl: null } };
}

/**
 * 8 oct. 2026 — paiement carte / Mobile Money abandonné : le gérant l'annule
 * pour choisir un autre mode de paiement, sans passer par l'équipe. Possible
 * seulement après `EVOLIA_CANCEL_DELAY_MS`, le temps qu'une confirmation déjà
 * en route arrive ; si Evolia confirme malgré tout plus tard, le paiement est
 * honoré (`reviveCancelledEvoliaPayment`).
 */
export async function cancelPendingEvoliaPayment(companyPaymentId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: { companySubscription: { include: { company: true } } },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };
  const subscription = payment.companySubscription;
  if (subscription.company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul le gérant de l'entreprise peut annuler ce paiement." };
  }
  if (payment.status !== "PENDING" || !isEvoliaPaymentMethod(payment.method)) {
    return { success: false, error: "Ce paiement ne peut plus être annulé." };
  }
  if (Date.now() - payment.createdAt.getTime() < EVOLIA_CANCEL_DELAY_MS) {
    return {
      success: false,
      error:
        "Si vous venez de payer, la confirmation peut prendre quelques minutes. Réessayez dans un quart d'heure.",
    };
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const { count } = await tx.companyPayment.updateMany({
      where: { id: companyPaymentId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        rejectionReason: CANCELLED_BY_COMPANY_REASON,
      },
    });
    if (count === 0) return false;
    if (payment.upsellQuantity == null) {
      await tx.companySubscription.updateMany({
        where: { id: subscription.id, status: "PENDING_REVIEW" },
        data: { status: "PENDING_PAYMENT" },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: viewer.id,
        action: "company_payment.cancel_by_company",
        targetType: "CompanyPayment",
        targetId: companyPaymentId,
        metadata: { method: payment.method, upsell: payment.upsellQuantity != null },
      },
    });
    return true;
  });
  if (!cancelled) return { success: false, error: "Ce paiement vient d'être traité." };

  revalidatePath(`/entreprises/${subscription.companyId}`);
  revalidatePath("/entreprise/paiement");
  return { success: true, data: undefined };
}
