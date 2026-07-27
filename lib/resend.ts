import { Resend } from "resend";
import type { ReactElement } from "react";

/**
 * Resend singleton. Ref: CEO_Summit_Architecture_Technique.docx
 *   "Email transactionnel — Resend. Templates : React Email."
 * Lazily instantiated so the app doesn't crash at import time in
 * environments without RESEND_API_KEY set (e.g. this sandbox / early dev).
 */
let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set — see .env.example");
    }
    client = new Resend(apiKey);
  }
  return client;
}

interface SendTransactionalEmailArgs {
  to: string;
  subject: string;
  react: ReactElement;
}

/**
 * Central send function — every transactional email in the app (activation,
 * password reset, event reminders, Deal Room notifications...) goes through
 * this so we have one place to add retry/logging/bounce handling later.
 */
export async function sendTransactionalEmail({ to, subject, react }: SendTransactionalEmailArgs) {
  const from = process.env.EMAIL_FROM || "noreply@ceosummit.mg";
  const resend = getResendClient();

  const { data, error } = await resend.emails.send({ from, to, subject, react });

  if (error) {
    // Caller decides whether to throw/retry; we always log for the audit trail.
    console.error("[resend] failed to send email", { to, subject, error });
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
