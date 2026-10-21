import Link from "next/link";
import { CalendarClock, ChevronRight, Wallet } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatAriary, formatEuro, formatDateFr, initials } from "@/lib/utils";

interface OpportunityCardProps {
  id: string;
  title: string;
  description: string;
  type: string;
  sector: string;
  budget: number | null;
  budgetEur: number | null;
  deadline: Date | null;
  createdAt: Date;
  author: { name: string; title: string | null; avatarUrl: string | null; role: string };
}

/** « 18 sept. » sans l'année quand elle est celle en cours. */
function shortDate(date: Date): string {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "Indian/Antananarivo",
  }).format(date);
}

/** Jours restants avant l'échéance, `null` si elle est passée. */
function daysLeft(deadline: Date): number | null {
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  return days >= 0 ? days : null;
}

/**
 * Refonte UI (21 oct. 2026) — budget et échéance mis en avant (ce qui décide
 * un dirigeant à ouvrir l'opportunité), type en étiquette dorée, secteur en
 * texte discret, auteur et date de publication en pied de carte.
 */
export function OpportunityCard({
  id,
  title,
  description,
  type,
  sector,
  budget,
  budgetEur,
  deadline,
  createdAt,
  author,
}: OpportunityCardProps) {
  const remaining = deadline ? daysLeft(deadline) : null;
  const urgent = remaining !== null && remaining <= 7;

  return (
    <Link
      href={`/deal-room/${id}`}
      className="group flex flex-col rounded-xl border border-border bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-md active:scale-[0.99] sm:p-5"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 rounded-full bg-gold-pale px-2.5 py-1 font-semibold text-amber-800">
          {type}
        </span>
        <span className="truncate text-text-muted">{sector}</span>
      </div>

      <h3 className="mt-3 text-base font-bold leading-snug text-navy group-hover:text-navy-mid">
        {title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-mid">{description}</p>

      {(budget != null || budgetEur != null || deadline) && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(budget != null || budgetEur != null) && (
            <div className="rounded-lg bg-surface px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                <Wallet className="h-3 w-3" aria-hidden="true" /> Budget
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-navy">
                {budget != null ? formatAriary(budget) : formatEuro(budgetEur!)}
              </p>
              {budget != null && budgetEur != null && (
                <p className="truncate text-xs text-text-muted">{formatEuro(budgetEur)}</p>
              )}
            </div>
          )}
          {deadline && (
            <div
              className={`rounded-lg px-3 py-2 ${urgent ? "bg-red-50" : "bg-surface"} ${
                budget == null && budgetEur == null ? "col-span-2" : ""
              }`}
            >
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                <CalendarClock className="h-3 w-3" aria-hidden="true" /> Échéance
              </p>
              <p className={`mt-0.5 text-sm font-bold ${urgent ? "text-red-700" : "text-navy"}`}>
                {shortDate(deadline)}
              </p>
              <p className={`text-xs ${urgent ? "text-red-600" : "text-text-muted"}`}>
                {remaining === null
                  ? "Clôturée"
                  : remaining === 0
                    ? "Aujourd'hui"
                    : `Dans ${remaining} jour${remaining > 1 ? "s" : ""}`}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2.5 border-t border-border pt-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={author.avatarUrl ?? undefined} alt={author.name} />
          <AvatarFallback className="text-xs">{initials(author.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{author.name}</p>
          <p className="truncate text-xs text-text-muted">
            {author.title ? `${author.title} · ` : ""}
            <time dateTime={createdAt.toISOString()} title={formatDateFr(createdAt)}>
              {shortDate(createdAt)}
            </time>
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
