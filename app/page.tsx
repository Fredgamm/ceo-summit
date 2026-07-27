import { redirect } from "next/navigation";

/**
 * Root route. The public marketing/media site (Pilier 3 — Média & positionnement
 * from the CEO Summit strategy) is a separate workstream; for now "/" simply
 * routes visitors to the member login, consistent with middleware.ts treating
 * "/" as a public route.
 */
export default function RootPage() {
  redirect("/login");
}
