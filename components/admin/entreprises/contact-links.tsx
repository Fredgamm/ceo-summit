/**
 * 23 nov. 2026 — liens de contact du back-office entreprises (e-mail,
 * téléphone, WhatsApp, site) : relancer et joindre une entreprise en dehors
 * de la plateforme sans recopier ses coordonnées à la main.
 */

/** Chiffres seuls, « + » initial conservé : forme attendue par `tel:`. */
function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** wa.me n'accepte qu'un numéro international, sans « + » ni espaces. */
function whatsappHref(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="break-all text-navy underline-offset-2 hover:underline">
      {email}
    </a>
  );
}

export function PhoneLinks({ phone }: { phone: string | null | undefined }) {
  if (!phone?.trim()) return <span className="text-text-muted">—</span>;
  const wa = whatsappHref(phone);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <a href={telHref(phone)} className="text-navy underline-offset-2 hover:underline">
        {phone}
      </a>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-text-muted underline-offset-2 hover:underline"
        >
          WhatsApp
        </a>
      )}
    </span>
  );
}

export function ExternalLink({ url }: { url: string }) {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-navy underline-offset-2 hover:underline"
    >
      {url}
    </a>
  );
}
