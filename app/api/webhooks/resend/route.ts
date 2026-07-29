import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyHmacSignature } from "@/lib/hmac";
import { resendWebhookSchema } from "@/lib/validations/webhooks";

/**
 * POST /api/webhooks/resend — E8-T09 "Historique campagnes avec taux
 * d'ouverture (webhook Resend)".
 *
 * Signature scheme simplified: verified with this project's existing generic
 * `verifyHmacSignature` (same as Evolia) against `X-Resend-Signature` +
 * `RESEND_WEBHOOK_SECRET`, rather than Resend's real Svix-based composite
 * signing — there's no live Resend account in this environment to fire a
 * real webhook against anyway. Wiring an actual Resend account later means
 * swapping this one function for Svix verification, nothing else changes.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("X-Resend-Signature");
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[resend webhook] RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    await prisma.webhookLog.create({
      data: {
        source: "resend",
        event: "unknown",
        payload: safeParseForLogging(rawBody),
        status: "REJECTED_INVALID_SIGNATURE",
        error: "HMAC signature mismatch",
      },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = resendWebhookSchema.safeParse(json);
  if (!parsed.success) {
    await prisma.webhookLog.create({
      data: {
        source: "resend",
        event: (json as { type?: string })?.type ?? "unknown",
        payload: json as object,
        status: "FAILED",
        error: `Validation failed: ${parsed.error.message}`,
      },
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const payload = parsed.data;
  const log = await prisma.webhookLog.create({
    data: { source: "resend", event: payload.type, payload: json as object, status: "RECEIVED" },
  });

  try {
    if (payload.type === "email.opened") {
      await handleEmailOpened(payload.data.email_id);
    }

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
    console.error("[resend webhook] processing failed", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

/** Idempotent: a resend of the same open event must not double-count. */
async function handleEmailOpened(resendMessageId: string) {
  const recipient = await prisma.broadcastRecipient.findFirst({
    where: { resendMessageId },
  });
  if (!recipient || recipient.openedAt) return;

  await prisma.broadcastRecipient.update({
    where: { id: recipient.id },
    data: { openedAt: new Date() },
  });
  await prisma.broadcast.update({
    where: { id: recipient.broadcastId },
    data: { openCount: { increment: 1 } },
  });
}

function safeParseForLogging(rawBody: string): object {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody.slice(0, 500) };
  }
}
