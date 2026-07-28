"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * E7-T01 — "Vue responsive mobile : liste plein écran → thread plein écran."
 * Both panes always render server-side; this just decides, from the
 * pathname, which one is visible on mobile. On desktop (md+) both show
 * side by side regardless.
 */
export function SplitPane({
  variant,
  className,
  children,
}: {
  variant: "list" | "detail";
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const threadOpen = pathname !== "/messagerie";
  const hiddenOnMobile = variant === "list" ? threadOpen : !threadOpen;

  return <div className={cn(hiddenOnMobile && "hidden md:flex", className)}>{children}</div>;
}
