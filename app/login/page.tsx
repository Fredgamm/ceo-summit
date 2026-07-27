import type { Metadata } from "next";
import { Suspense } from "react";
import { Diamond, CalendarDays, Mail } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Connexion" };

const FEATURES = [
  { icon: Diamond, label: "Deal Room — Opportunités B2B exclusives" },
  { icon: CalendarDays, label: "Événements Summit, dîners privés & webinaires" },
  { icon: Mail, label: "Messagerie privée entre dirigeants" },
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Left brand panel — hidden on mobile (wireframe .login-left) */}
      <div className="hidden w-[45%] flex-col justify-center bg-navy p-[60px] md:flex">
        <div className="mb-10">
          <div className="mb-2 text-[26px] font-extrabold text-white">
            CEO<span className="text-gold">Summit</span>
          </div>
          <div className="text-sm uppercase tracking-wide text-white/50">
            Le cercle des décideurs de l&apos;Océan Indien
          </div>
        </div>

        <div className="mb-4 text-[28px] font-bold leading-tight text-white">
          Votre réseau d&apos;affaires premium
        </div>
        <div className="mb-12 text-[15px] leading-relaxed text-white/55">
          Accédez à la Deal Room, au Catalogue de services, aux salles thématiques et aux
          événements exclusifs CEO Summit.
        </div>

        <div className="flex flex-col gap-4">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-3.5 text-[13.5px] text-white/70">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/20">
                <f.icon className="h-4 w-4 text-gold" />
              </div>
              {f.label}
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-white/10 pt-10 text-xs text-white/30">
          CEO Summit © 2026 — Plateforme réservée aux membres
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-white p-8 md:p-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
