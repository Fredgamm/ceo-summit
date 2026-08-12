import { headers } from "next/headers";

/**
 * Sprint de correction (5 août 2026, EX-T01) — clé de rate limiting par IP
 * pour les Server Actions accessibles sans compte (inscription, mot de
 * passe oublié). `X-Real-IP`/`X-Forwarded-For` sont posés par Nginx en
 * production (voir deploy/nginx.conf) ; `"unknown"` en dev local direct
 * (pas de proxy devant `next dev`) — dans ce cas la limite se réduit de
 * facto à un seul compartiment partagé, ce qui reste un filet de sécurité
 * acceptable en dev, pas un problème en production derrière Nginx.
 *
 * Correctif (7 août 2026, audit) — `X-Forwarded-For` était lu en premier et
 * pris à son premier segment, alors que Nginx pose
 * `X-Forwarded-For: $proxy_add_x_forwarded_for`, qui **ajoute** l'IP réelle
 * à celle déjà présente dans la requête entrante au lieu de la remplacer :
 * un client envoyant lui-même un `X-Forwarded-For` arbitraire (une valeur
 * différente à chaque requête) neutralisait entièrement le rate limiting.
 * `X-Real-IP` est en revanche posé par Nginx via `$remote_addr` —
 * l'adresse TCP réelle de la connexion, jamais falsifiable par le client
 * (Nginx écrase toute valeur envoyée par celui-ci) — c'est donc la seule
 * source fiable, et elle passe en premier désormais.
 */
export function getClientIp(): string {
  const headerList = headers();
  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}
