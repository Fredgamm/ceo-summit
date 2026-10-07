import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type AddButtonProps = {
  children: React.ReactNode;
  className?: string;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/**
 * Bouton d'ajout (publier une opportunité, ajouter un service, créer une
 * salle…) : même taille et même icône partout. Lien si `href`, action sinon.
 */
export function AddButton({ children, className, href, onClick }: AddButtonProps) {
  if (href) {
    return (
      <Button asChild className={className}>
        <Link href={href}>
          <Plus /> {children}
        </Link>
      </Button>
    );
  }
  return (
    <Button onClick={onClick} className={className}>
      <Plus /> {children}
    </Button>
  );
}
