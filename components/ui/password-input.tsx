"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Rapport QA du 30 septembre 2026 — les navigateurs modernes n'affichent
 * plus systématiquement d'icône native "afficher le mot de passe" (Chrome
 * l'a retirée, Firefox la cache derrière un réglage non actif par défaut),
 * d'où ce bouton custom. Partagé entre tous les champs mot de passe de la
 * plateforme (login, création/réinitialisation, invitation) plutôt que
 * dupliqué, pour un comportement identique partout.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-navy"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
