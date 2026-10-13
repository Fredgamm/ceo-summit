# Module 06 — Analyse de viabilité business du MVP simplifié (statut unique, Evolia, sans check-in)

> **Statut :** Analyse — à discuter avec le client avant de valider le périmètre `mvp-connect-simple`
> **Version :** 1.0
> **Date :** 12 août 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Document lié :** [`05_notes_internes_integration_evolia.md`](./05_notes_internes_integration_evolia.md)

---

## 0. Ce que je réponds à la question posée

**Oui, la plateforme reste viable techniquement** — un réseau qui connecte des dirigeants inscrits, sans logique de paiement/offres interne, fonctionne très bien en soi. Mais "viable" au sens produit dépend de deux choses qu'on n'a pas encore vérifiées avec le client : est-ce que ce qu'on retire est de la **complexité technique interne** (sans impact perçu par l'utilisateur ou le revenu), ou est-ce que c'est une **fonctionnalité qui génère aujourd'hui de la valeur vendue ou une garantie opérationnelle**. Le code actuel montre que ce n'est pas homogène — certaines briques qu'on prévoit de retirer touchent directement le revenu ou la sécurité de l'évènement physique, d'autres non.

---

## 1. Ce qui est réellement rattaché aux offres aujourd'hui (vérifié dans le code, pas supposé)

Le modèle actuel (`Plan`, `prisma/schema.prisma`) ne sert pas qu'à calculer un prix. Trois mécanismes concrets en dépendent :

1. **`Plan.rank`** pilote le tier effectif de l'utilisateur (Member/Executive/Chairman, `lib/plan-access.ts`), qui à son tour **contrôle l'accès au Deal Room** : visibilité de certaines opportunités par tier, et l'achat de crédits Deal Room réservé aux tiers Executive et au-dessus (`/credits/acheter`).
2. **`Plan.includedCredits` / `Plan.hasUnlimitedCredits`** déterminent combien de crédits Deal Room sont offerts gratuitement à chaque collaborateur d'une entreprise à la confirmation du paiement — c'est un avantage chiffrable, pas juste un chiffre administratif.
3. **`Plan.minParticipants`** impose un seuil minimum de collaborateurs réellement inscrits avant de pouvoir payer — un garde-fou anti-abus sur les remises volume (Light/Medium/Premium/Ultimate, -10 % à -50 % selon le nombre de participants engagés).

Le nouveau modèle (statut unique + `offerCode` limité au quota de collaborateurs) supprime les trois par construction : plus de tier différencié, plus de crédits inclus différenciés, plus de seuil vérifié avant paiement (Evolia ne le vérifiera pas).

## 2. Impact par brique retirée

| Brique retirée                                                | Impact business réel                                                                                                                                                                                                                                                                                                                                                                                                                     | Niveau de risque         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Remise volume par palier (Light -10 %→Ultimate -50 %)         | **Aucun** — c'est une logique de _prix_, qui peut continuer à vivre entièrement côté Evolia (le montant facturé peut toujours varier). Rien à faire côté plateforme.                                                                                                                                                                                                                                                                     | 🟢 Nul                   |
| Seuil minimum de participants avant paiement                  | Faible — c'était un garde-fou qualité/anti-abus sur la remise volume, pas une fonctionnalité vendue à l'utilisateur. Sa disparition ne retire rien que le client ait mis en avant commercialement.                                                                                                                                                                                                                                       | 🟢 Faible                |
| Crédits Deal Room inclus, différenciés par offre              | Moyen — c'est un avantage chiffrable que l'entreprise reçoit _parce qu'elle a payé plus_. Si tout le monde reçoit le même statut, il faut décider explicitement : soit tout le monde reçoit le même crédit inclus (coût direct à chiffrer), soit personne n'en reçoit et les crédits deviennent 100 % achetables à la carte (le mécanisme d'achat, lui, peut rester un revenu indépendant du statut).                                    | 🟡 À trancher            |
| Tier Executive/Chairman → gating Deal Room + achat de crédits | **Élevé** — aujourd'hui, "Executive et au-dessus" est une porte d'entrée payante vers le Deal Room. Avec un statut unique, cette porte disparaît : soit le Deal Room devient ouvert à tout inscrit (perte d'un argument de vente "réseau filtré/exclusif"), soit il faut inventer un autre critère d'accès. Ce n'est pas neutre pour le positionnement du produit ("cercle privé de dirigeants").                                        | 🔴 Élevé                 |
| Scan QR + contrôle d'accès multi-poste à l'évènement          | **Élevé, mais d'une nature différente** — ce n'est pas une RG liée au paiement/aux offres, c'est un **outil opérationnel jour J** : contrôle d'accès physique, anti-fraude sur les badges, comptage en temps réel par poste d'entrée (VIP/Staff). Le retirer n'a rien à voir avec la simplification du paiement — ça revient à décider de gérer l'accès physique à l'évènement autrement (liste papier, autre outil, ou aucun contrôle). | 🔴 Élevé, sujet distinct |

## 3. Ce qui ne dépend pas de cette décision

- L'achat de crédits Deal Room à la carte (`/credits/acheter`) peut continuer d'exister comme revenu indépendant du statut de l'utilisateur, si on retire la gate "Executive+" et qu'on l'ouvre à tout inscrit.
- La messagerie, les salles thématiques, le catalogue de membres/services : aucun ne dépend du tier ou de l'offre — ils restent identiques quelle que soit la décision ci-dessus.

## 4. Deux décisions à faire trancher explicitement par le client, pas par nous

1. **Le Deal Room reste-t-il un avantage "premium" réservé à certains inscrits, ou devient-il ouvert à tout le monde ?** Si le client veut garder un filtre, il faut définir un nouveau critère (indépendant de l'ancien tier) — sinon on retire silencieusement un argument de vente actuel sans que personne l'ait décidé consciemment.
2. **Comment le contrôle d'accès physique à l'évènement est-il assuré sans le scan QR ?** C'est un sujet de sécurité/logistique jour J, pas un sujet de paiement — il mérite d'être posé séparément, indépendamment de la bascule Evolia.

## 5. Verdict

Viable **à condition de trancher ces deux points avec le client avant de coder sur `mvp-connect-simple`**. Le reste (remise volume, seuil de participants, crédits inclus différenciés) peut être simplifié sans risque business identifiable — c'était de la complexité interne, pas de la valeur perçue par le client final.
