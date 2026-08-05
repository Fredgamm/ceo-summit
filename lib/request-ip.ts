import { headers } from "next/headers";

/**
 * Sprint de correction (5 août 2026, EX-T01) — clé de rate limiting par IP
 * pour les Server Actions accessibles sans compte (inscription, mot de
 * passe oublié). `X-Real-IP`/`X-Forwarded-For` sont posés par Nginx en
 * production (voir deploy/nginx.conf) ; `"unknown"` en dev local direct
 * (pas de proxy devant `next dev`) — dans ce cas la limite se réduit de
 * facto à un seul compartiment partagé, ce qui reste un filet de sécurité
 * acceptable en dev, pas un problème en production derrière Nginx.
 */
export function getClientIp(): string {
  const headerList = headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headerList.get("x-real-ip") ?? "unknown";
}
