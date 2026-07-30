"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

/**
 * B1f (audit du 29 juillet 2026) — le lien "Déconnexion" de member-sidebar.tsx
 * n'appelait jamais next-auth/react's signOut() : c'était un simple
 * <Link href="/login">, donc la session restait valide et middleware.ts
 * renvoyait immédiatement l'utilisateur "déconnecté" vers /dashboard. Ce
 * composant est le point d'appel réel — utilisé ici et dans MemberSidebar.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={className}>
      <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span>Déconnexion</span>
    </button>
  );
}
