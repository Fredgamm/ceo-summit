# Module 12 — Audit des mécanismes d'offre, d'achat et de paiement + modèle cible

> **Statut :** Audit réalisé, nettoyage fait, modèle cible en grande partie construit (voir §4 et §5)
> **Version :** 1.1 — mise à jour le 25 septembre 2026 (audit MVP : état réel du code, points dépassés marqués)
> **Date :** 22 septembre 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Documents liés :** `09` (accès égal), `11` (intégration Evolia), `BACKLOG_MVP.md`

---

## 1. Le problème de fond — trois notions confondues

La plateforme ne connaît aujourd'hui qu'**une seule** notion, et s'en sert pour trois choses qui n'ont pas la même durée de vie ni les mêmes règles :

| Notion réelle                                                                                   | Représentation actuelle                           | Problème                                                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Compte utilisateur** — quelqu'un qui se connecte                                              | `User.companyId`, `CompanyInvite`                 | (correct)                                                                                             |
| **Participant à l'évènement** — quelqu'un qui assiste, nom + email, **pas forcément un compte** | _(n'existe pas)_                                  | Aucun modèle. `EventRegistration` exige un `userId`, donc impossible d'inscrire quelqu'un sans compte |
| **Place achetée** — ce que l'offre autorise                                                     | `Plan.maxTeamMembers` **et** `Plan.includedSeats` | Deux champs concurrents, le code prend le minimum des deux                                            |

Conséquence directe, contraire à la règle validée le 16 septembre (« le gestionnaire qui paie n'est pas forcément un participant ») : `inviteTeammate` compte `prisma.user.count({ where: { companyId } })` contre le quota — **le gestionnaire consomme une place même s'il ne participe pas à l'évènement**.

---

## 2. Incohérences relevées

### 2.1 `pricingMode: null` facture au participant sans que personne l'ait décidé

`computeDueAmount` traite `null` comme `PER_PARTICIPANT` (comportement historique) : `priceAr × declaredParticipants`. Quatre offres en base ont `pricingMode: null` (`demo-chairman`, `executive`, `chairman`, `partenaire-institutionnel`). Une offre créée sans choisir explicitement de mode se retrouve donc facturée à la personne, et le checkout affiche un champ « Nombre de participants prévu » éditable qui fait varier le prix.

### 2.2 Deux champs pour la même chose

- `maxTeamMembers` — utilisé par les 6 offres actives du catalogue (Bronze = 2, Gold = 6, Platinum = 10…).
- `includedSeats` — utilisé par **une seule** offre, inactive (`member`). Lu par `seatCap()` uniquement en `FIXED_BUNDLE`.

`inviteTeammate` applique le plus restrictif des deux. Le formulaire admin affiche les deux, sans qu'on puisse deviner lequel fait foi.

### 2.3 `TIERED_GROUP` — mécanisme sans usage

Construit le 14 septembre : valeur d'enum, modèle `PlanPriceBracket`, migration, UI de paliers dans le formulaire admin, affichage dans `PlanPicker`, branches dans `computeDueAmount`, `meetsMinParticipants` et `PaymentProofForm` — **20 fichiers au total, pour 0 offre et 0 palier en base**. Le modèle validé le 22 septembre le remplace par deux offres distinctes en `PER_PARTICIPANT` (Groupement 10 à 750 €/pers, Groupement 30 à 650 €/pers), chacune à tarif plat au-delà de son seuil.

> **✅ Tarif confirmé (25 septembre 2026).** La grille officielle validée par le client (capture partagée le même jour) fixe les offres Groupement à **720 €/pers** (seuil 10) et **550 €/pers** (seuil 30) — pas 750 €/650 € comme énoncé ci-dessus, ni 650 €/500 € comme l'ancienne ligne de `BACKLOG_MVP.md`. C'est la valeur déjà configurée en production (`Plan.priceEur`), vérifiée conforme à la grille client sur les 8 offres du catalogue (Platinum 50 000 €, Gold 25 000 €, Silver 15 000 €, Bronze 8 500 €, Early Bird 850 €, Executive Pass 950 €, Groupement 10 = 720 €, Groupement 30 = 550 €). Rien à changer côté code.

### 2.4 Crédits Deal Room toujours dans le formulaire d'offre

« Crédits Deal Room inclus » et « Crédits illimités » sont encore demandés à chaque création d'offre, alors que les crédits ont été retirés du parcours le 3 septembre (`conception/09` §4).

### 2.5 « Rang (comparaison d'accès) » — libellé mensonger

Champ obligatoire, présenté comme servant à comparer les accès, alors que l'accès est identique pour tout membre payé depuis le 3 septembre. Le champ sert encore, mais uniquement à dériver un libellé `Tier` hérité (`nearestLegacyTier`), affiché à titre indicatif.

### 2.6 Split plateforme/évènement exposé mais inutilisé

`eventId` et `linkedPlatformPlanId` : aucune offre active ne les renseigne (seules les 6 offres héritées, désactivées). Le formulaire expose pourtant deux sélecteurs, et la validation impose un lien obligatoire dès qu'un évènement est choisi.

### 2.7 `declaredParticipants` au checkout

Contraire à la règle du 22 septembre pour les offres principales. Reste légitime **uniquement** pour les offres Groupement, dont le prix dépend par nature de l'effectif déclaré.

---

## 3. Modèle cible

### 3.1 Trois familles d'offres, et rien d'autre

| Famille                           | Mode                                                                           | Quantité à l'achat | Effectif                               | Exemple                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------ | -------------------------------------- | -------------------------------------------------------------------------------------- |
| **Offre principale**              | `FIXED_BUNDLE`                                                                 | Toujours 1         | Fixé par l'admin (`maxTeamMembers`)    | Bronze = 2 places, 8 500 €                                                             |
| **Offre groupement**              | `PER_PARTICIPANT`                                                              | 1                  | Déclaré à l'achat, ≥ `minParticipants` | Groupement 10 = 720 €/pers, seuil 10 ; Groupement 30 = 550 €/pers, seuil 30            |
| **Offre supplémentaire (upsell)** | `FIXED_BUNDLE` + `isUpsell`, ou `PER_PARTICIPANT` (auto-éligible, voir règles) | Libre (× N)        | 1 place par unité achetée              | _(aucune offre `FIXED_BUNDLE`+`isUpsell` en base actuellement — voir note ci-dessous)_ |

Règles :

- Une offre principale ne s'achète **jamais** en plusieurs exemplaires au checkout initial.
- Une offre upsell ne s'achète **jamais** comme offre principale — elle vient toujours s'ajouter à un abonnement déjà actif.
- ~~La bascule automatique « 10 × Executive Pass → tarif Groupement 10 » est **explicitement reportée** (décision du 22 septembre), à construire séparément.~~ **Construite depuis** (constat audit du 25 septembre) : au checkout (`PaymentProofForm`) comme à l'achat d'un supplément (`UpsellPurchaseForm`), un effectif qui atteint le seuil d'une offre Groupement bascule automatiquement sur son tarif par personne.
- Les offres Groupement (`PER_PARTICIPANT`) sont à la fois des offres principales du catalogue d'inscription **et** automatiquement proposables en supplément ; une offre marquée `isUpsell` est exclue du catalogue d'inscription et des liens profonds `?offre=` (correctif du 25 septembre).
- **Précision (25 septembre 2026) — cas Executive Pass.** La grille client validée le liste comme offre principale à part entière (950 €, 1 accès), au même titre que Groupement 10/30 — pas comme un supplément caché. C'est cohérent avec sa configuration réelle en production : `pricingMode: PER_PARTICIPANT`, `isUpsell: false`. Il reste donc visible au catalogue d'inscription (comme une offre Groupement à effectif fixe de 1), tout en restant automatiquement proposable en supplément via `UPSELL_ELIGIBLE_WHERE` (toute offre `PER_PARTICIPANT` y est éligible, indépendamment d'`isUpsell`) — aucune offre `FIXED_BUNDLE`+`isUpsell` n'existe donc actuellement en base ; ce troisième cas de la ligne ci-dessus reste théorique tant qu'aucune offre de ce type n'est créée par l'admin.

### 3.2 Effectif autorisé

```
places autorisées = quota de l'offre principale + Σ (quantité des suppléments payés)
```

Un seul champ porte le quota d'une offre : `maxTeamMembers`. `includedSeats` disparaît.

**Construit (constat du 25 septembre) :** `lib/company-seats.ts::seatCap()` est la source unique du plafond — `maxTeamMembers` en `FIXED_BUNDLE`, effectif déclaré (`declaredParticipants`) en `PER_PARTICIPANT`, plus `CompanySubscription.extraSeats` (suppléments payés). À l'enregistrement d'une offre, le champ sans effet dans son mode est remis à vide (seuil minimum en forfait fixe, nombre de places en groupement).

### 3.3 Participant ≠ utilisateur ≠ place

Un **participant** est un enregistrement nom + email rattaché à l'entreprise, créé depuis le tableau de bord après paiement, avec une case « Je participe » pour que le gestionnaire s'inclue lui-même. Il consomme une place. Il peut, mais ne doit pas nécessairement, correspondre à un compte utilisateur.

**État au 25 septembre :** seule la case « Je participe » existe (`Company.adminParticipates`, prise en compte dans le décompte des places). Le modèle participant distinct du compte utilisateur **n'est pas construit** — un participant reste aujourd'hui un collaborateur invité (compte utilisateur).

C'est la validation de cette liste — pas le paiement — qui déclenche la génération des badges côté Evolia (`company.participants.confirmed`, voir `conception/11` §3).

---

## 4. Nettoyage effectué

| Action                                                                                                   | Statut                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Retrait complet de `TIERED_GROUP` (enum, `PlanPriceBracket`, migration, UI, calculs, tests)              | ✅                                                                                              |
| `includedSeats` fusionné dans `maxTeamMembers`, ancien `seatCap()` supprimé                              | ✅ — un nouveau `seatCap()` a depuis été réintroduit comme source unique du plafond (voir §3.2) |
| `pricingMode` rendu obligatoire, défaut `FIXED_BUNDLE`, fin du repli silencieux vers « par participant » | ✅                                                                                              |
| Crédits Deal Room retirés du formulaire d'offre                                                          | ✅                                                                                              |
| « Rang » et split plateforme/évènement retirés du formulaire d'offre                                     | ✅                                                                                              |

## 5. Reste à construire (hors nettoyage)

1. ~~`Plan.isUpsell` + achat en quantité d'une offre supplémentaire, rattaché à l'abonnement existant.~~ ✅ Fait (22 septembre) — `purchaseUpsellSeats`, `CompanySubscription.extraSeats`.
2. ~~Cumul des places (`quota de base + suppléments payés`) comme source unique du plafond.~~ ✅ Fait — `seatCap()` (§3.2).
3. Modèle participant + écran de composition de la liste avec case « Je participe ». ⏳ **Pas construit** — seule la case « Je participe » (`Company.adminParticipates`) existe.
4. Câblage des deux déclencheurs Evolia (`company.registration.pushed`, `company.participants.confirmed`) — ⏳ toujours bloqué tant que l'endpoint Evolia est inconnu.
