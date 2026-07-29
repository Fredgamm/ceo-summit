import Image from "next/image";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Centered white card on the navy/surface background — used by every
 * "secondary" auth page (activation, reset password, demande d'accès) that
 * doesn't need the full split-screen brand panel from /login.
 */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-white p-8 shadow-card-md">
        <div className="mb-6 text-center">
          <Image
            src="/logo/ceo-summit-logo.png"
            alt="CEO Summit"
            width={160}
            height={77}
            className="mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-navy">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
