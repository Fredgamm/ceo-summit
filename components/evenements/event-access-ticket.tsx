import type { ReactNode } from "react";

/**
 * Carte d'accès à un événement, en forme de billet : talon supérieur (statut
 * d'accès) séparé de l'action par une perforation. Les entailles reprennent
 * la couleur de fond de la page (`bg-background`).
 */
export function EventAccessTicket({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-navy text-white shadow-card-md">
      <div className="px-5 pb-5 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">{eyebrow}</p>
        <p className="mt-1 text-xl font-bold leading-tight">{title}</p>
        {children && <div className="mt-2 text-sm leading-relaxed text-white/75">{children}</div>}
      </div>
      {actions && (
        <>
          <div className="relative" aria-hidden="true">
            <div className="mx-5 border-t-2 border-dashed border-white/20" />
            <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
            <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
          </div>
          <div className="flex flex-col gap-2 px-5 pb-5 pt-4">{actions}</div>
        </>
      )}
    </div>
  );
}
