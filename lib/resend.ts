import { Resend } from "resend";
import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import type { ReactElement } from "react";

/**
 * Resend singleton. Ref: CEO_Summit_Architecture_Technique.docx
 *   "Email transactionnel — Resend. Templates : React Email."
 * Lazily instantiated so the app doesn't crash at import time in
 * environments without RESEND_API_KEY set (e.g. this sandbox / early dev).
 */
let client: Resend | null = null;

function getResendClient(apiKey: string): Resend {
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

/**
 * 3 septembre 2026 — mode dev local : sans clé Resend réelle (absente ou
 * encore la valeur placeholder de .env.example), on route tous les emails
 * transactionnels vers Maildev (SMTP local, aucune authentification) plutôt
 * que d'échouer contre l'API Resend. Activable aussi explicitement via
 * MAIL_DEV_MODE=true (utile si une vraie clé traîne en local mais qu'on
 * veut quand même tester sans consommer de quota / sans risque d'envoi
 * réel). Voir Maildev : `npx maildev`, UI sur http://localhost:1080.
 */
function isMailDevMode(): boolean {
  if (process.env.MAIL_DEV_MODE === "true") return true;
  const key = process.env.RESEND_API_KEY;
  return !key || key === "re_xxxxxxxxxxxx";
}

let devTransport: nodemailer.Transporter | null = null;

function getDevTransport(): nodemailer.Transporter {
  if (!devTransport) {
    devTransport = nodemailer.createTransport({
      host: process.env.MAILDEV_HOST || "localhost",
      port: Number(process.env.MAILDEV_PORT || 1025),
      secure: false,
      ignoreTLS: true,
    });
  }
  return devTransport;
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

  if (isMailDevMode()) {
    const html = await render(react);
    try {
      await getDevTransport().sendMail({ from, to, subject, html });
    } catch (err) {
      console.error(
        "[resend] MAIL_DEV_MODE actif mais Maildev est injoignable sur " +
          `${process.env.MAILDEV_HOST || "localhost"}:${process.env.MAILDEV_PORT || 1025}` +
          " — lance `npx maildev` (UI sur http://localhost:1080).",
        err
      );
      throw err;
    }
    return { id: "maildev-local" };
  }

  const resend = getResendClient(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({ from, to, subject, react });

  if (error) {
    // Caller decides whether to throw/retry; we always log for the audit trail.
    console.error("[resend] failed to send email", { to, subject, error });
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
