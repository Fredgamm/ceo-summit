import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyHmacSignature } from "@/lib/hmac";
import { generateSecureToken, ACTIVATION_TOKEN_TTL_MS } from "@/lib/tokens";
import { evoliaWebhookSchema } from "@/lib/validations/webhooks";
import { sendTransactionalEmail } from "@/lib/resend";
import { syncUserPlanCache } from "@/lib/membership-sync";
import ActivationEmail from "@/emails/activation-email";
import type { Tier } from "@prisma/client";

/**
 * POST /api/webhooks/evolia
 * Ref: phase1_evolia_membres.md UC-P1-01 + CEO_Summit_Architecture_Technique.docx
 *
 * Flow: Evolia confirms a payment → webhook here → verify HMAC → upsert
 * User + Membership → generate 72h activation token → email the member.
 * Target: < 5 minutes between Evolia confirmation and member receiving access
 * (vs. 24-48h manual process today).
 *
 * This route is explicitly excluded from middleware.ts auth (see matcher
 * there) — it must stay reachable without a session, protected only by HMAC.
 */

const TIER_MAP: Record<string, Tier> = {
  member: "MEMBER",
  executive: "EXECUTIVE",
  chairman: "CHAIRMAN",
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("X-Evolia-Signature");
  const secret = process.env.EVOLIA_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[evolia webhook] EVOLIA_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // ── 1. Verify signature before touching the body's contents at all ──
  const isValidSignature = verifyHmacSignature(rawBody, signature, secret);

  if (!isValidSignature) {
    await prisma.webhookLog.create({
      data: {
        source: "evolia",
        event: "unknown",
        payload: safeParseForLogging(rawBody),
        status: "REJECTED_INVALID_SIGNATURE",
        error: "HMAC signature mismatch",
      },
    });
    // 401, not 400 — do not leak whether the payload itself was well-formed.
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse + validate payload shape ──
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = evoliaWebhookSchema.safeParse(json);
  if (!parsed.success) {
    await prisma.webhookLog.create({
      data: {
        source: "evolia",
        event: (json as { event?: string })?.event ?? "unknown",
        payload: json as object,
        status: "FAILED",
        error: `Validation failed: ${parsed.error.message}`,
      },
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const payload = parsed.data;

  const log = await prisma.webhookLog.create({
    data: {
      source: "evolia",
      event: payload.event,
      payload: json as object,
      status: "RECEIVED",
    },
  });

  try {
    if (payload.event === "payment.confirmed") {
      await handlePaymentConfirmed(payload);
    }
    // payment.failed / payment.refunded: logged for audit, no account action
    // needed today — extend here once refund/dunning flows are built (EX-T*).

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    return NextResponse.json({ data: { received: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: message },
    });
    console.error("[evolia webhook] processing failed", err);
    // 500 signals Evolia to retry (per architecture doc: "si le webhook échoue
    // 3 fois de suite, l'admin peut créer manuellement le compte").
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handlePaymentConfirmed(payload: ReturnType<typeof evoliaWebhookSchema.parse>) {
  const tier = TIER_MAP[payload.subscription.tier];
  const email = payload.member.email.toLowerCase();
  const role = tier === "CHAIRMAN" ? "CHAIRMAN" : tier === "EXECUTIVE" ? "EXECUTIVE" : "MEMBER";

  // ── Idempotence (RG-P1-01) ── a retry of the same Evolia payment must not
  // create a second Membership. `paymentRef` is unique in the schema; check
  // first so a duplicate is a clean no-op instead of a thrown P2002 error.
  const duplicate = await prisma.membership.findUnique({
    where: { paymentRef: payload.payment.reference },
  });
  if (duplicate) {
    console.warn(
      `[evolia webhook] duplicate payment.reference ${payload.payment.reference} — already processed, ignoring`
    );
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      // Existing member renewing/upgrading — status flips back to ACTIVE if
      // it had lapsed (RG: "réactivation si expiré"), and role tracks the
      // tier from the new payment so an upgrade (e.g. member → executive)
      // isn't left stale on the old role.
      status: "ACTIVE",
      role,
    },
    create: {
      email,
      name: payload.member.name,
      phone: payload.member.phone,
      role,
      status: "PENDING_ACTIVATION",
    },
  });

  // Phase 0 of the offers/payment rework (30 juillet 2026) — resolve the Plan
  // row mirroring this legacy tier (seeded by prisma/backfill-plans.ts) and
  // route the cache write through the shared sync function instead of a
  // second independent `prisma.user.update({ data: { role } })` — this is
  // exactly the dual-write-path problem that function exists to fix.
  const plan = await prisma.plan.findFirst({ where: { name: tier, scope: "INDIVIDUAL" } });

  await prisma.membership.create({
    data: {
      userId: user.id,
      tier,
      planId: plan?.id,
      startDate: new Date(payload.subscription.startDate),
      endDate: new Date(payload.subscription.endDate),
      status: "ACTIVE",
      price: payload.payment.amount,
      paymentRef: payload.payment.reference,
    },
  });

  if (plan) {
    await syncUserPlanCache(user.id, plan.id);
  } else {
    console.warn(
      `[evolia webhook] no Plan row found for legacy tier "${tier}" — planId not backfilled for user ${user.id}`
    );
  }

  // Reset/create the Deal Room credit balance per tier rules (E6-T04).
  const includedCredits = tier === "CHAIRMAN" ? 999999 : tier === "EXECUTIVE" ? 10 : 0;
  await prisma.creditBalance.upsert({
    where: { userId: user.id },
    update: { included: includedCredits, used: 0, resetAt: new Date(payload.subscription.endDate) },
    create: {
      userId: user.id,
      included: includedCredits,
      purchased: 0,
      used: 0,
      resetAt: new Date(payload.subscription.endDate),
    },
  });

  // Only send an activation email to genuinely new accounts. An existing
  // active member renewing shouldn't get an "activate your account" email —
  // that's the "mise à jour silencieuse" case from phase1 UC-P1-01 alt flow.
  if (!existingUser) {
    const token = generateSecureToken();
    await prisma.activationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS),
      },
    });

    const activationUrl = `${process.env.NEXTAUTH_URL}/activer/${token}`;
    await sendTransactionalEmail({
      to: user.email,
      subject: "Votre accès CEO Summit est prêt — activez votre compte",
      react: ActivationEmail({
        memberName: user.name,
        tier: payload.subscription.tier,
        activationUrl,
      }),
    });
  }
}

/** Best-effort JSON parse for logging invalid-signature attempts without throwing. */
function safeParseForLogging(rawBody: string): object {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody.slice(0, 500) };
  }
}
