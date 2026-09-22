import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import type { ReactElement } from "react";

/**
 * 22 septembre 2026 — remplace l'envoi via l'API Resend par un envoi SMTP
 * direct sur la boîte mail existante de ceo-summit.mg, plutôt que d'ouvrir un
 * nouveau compte chez un prestataire tiers. Le fichier garde son nom
 * (`lib/resend.ts`, 30+ imports ailleurs dans le projet) pour ne pas propager
 * un renommage sans rapport avec ce changement.
 *
 * Conséquence assumée : le suivi "taux d'ouverture" des campagnes (E8-T09,
 * `app/api/webhooks/resend/route.ts`) reposait sur le tracking automatique de
 * Resend — plus aucun évènement n'arrivera sur ce webhook une fois basculé
 * en SMTP pur. La route reste en place (fonctionnalité déjà construite,
 * inoffensive à laisser inactive) mais `openedAt`/`openCount` ne
 * progresseront plus tant qu'aucun prestataire équivalent n'est rebranché.
 */
function isMailDevMode(): boolean {
  if (process.env.MAIL_DEV_MODE === "true") return true;
  return !isSmtpConfigured();
}

/** Whether real (non-placeholder) SMTP credentials are present — used by the
 * admin settings page to show accurate "Connecté"/"Non configuré" status,
 * independent of the MAIL_DEV_MODE override above. */
export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  return Boolean(host && user && password) && host !== "smtp.exemple.mg";
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

let smtpTransport: nodemailer.Transporter | null = null;

function getSmtpTransport(): nodemailer.Transporter {
  if (!smtpTransport) {
    const port = Number(process.env.SMTP_PORT || 587);
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 = TLS implicite dès la connexion ; tout autre port (587, 25)
      // démarre en clair puis passe en TLS via STARTTLS — nodemailer le fait
      // automatiquement quand secure: false et que le serveur l'annonce.
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return smtpTransport;
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
  const from = process.env.EMAIL_FROM || "noreply@ceo-summit.mg";
  const html = await render(react);

  if (isMailDevMode()) {
    try {
      await getDevTransport().sendMail({ from, to, subject, html });
    } catch (err) {
      console.error(
        "[mail] MAIL_DEV_MODE actif mais Maildev est injoignable sur " +
          `${process.env.MAILDEV_HOST || "localhost"}:${process.env.MAILDEV_PORT || 1025}` +
          " — lance `npx maildev` (UI sur http://localhost:1080).",
        err
      );
      throw err;
    }
    return { id: "maildev-local" };
  }

  try {
    const info = await getSmtpTransport().sendMail({ from, to, subject, html });
    return { id: info.messageId };
  } catch (err) {
    // Caller decides whether to throw/retry; we always log for the audit trail.
    console.error("[mail] failed to send email via SMTP", { to, subject, err });
    throw new Error(`Failed to send email: ${err instanceof Error ? err.message : String(err)}`);
  }
}
