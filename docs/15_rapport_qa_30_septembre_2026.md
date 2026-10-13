# Module 15 — Rapport de test QA du 30 septembre 2026

> **Statut :** ✅ Implémenté en local (30 sept. 2026) — type-check, lint, 754 tests et build tous verts. Reste à valider visuellement en navigateur avant tout déploiement.
> **Version :** 1.0
> **Date :** 30 septembre 2026
> **Source :** `conception/Test a corriger 30sept 26docx.docx` (testeur, environnement Production)
> **Méthode :** même format que les modules `12` et `14` — attendu vs constaté, puis état réel du code

---

## 0. Vue d'ensemble — ordre suggéré

| #   | Sujet                                                                      | Effort                                           | Type                                                                           |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | Logo texte → vrai logo dans les emails                                     | **Très faible** (1 fichier, 1 composant partagé) | Correctif                                                                      |
| 2   | Bouton "Soumettre à nouveau" + texte email paiement rejeté                 | Très faible                                      | Correctif texte                                                                |
| 3   | Texte email invitation collaborateur                                       | Très faible                                      | Correctif texte                                                                |
| 4   | Contact réel (téléphones/emails) — page "Accès en attente"                 | Très faible                                      | Correctif texte                                                                |
| 5   | "Bienvenue dans le cercle" → "Cercle des Décideurs"                        | Très faible                                      | Correctif texte                                                                |
| 6   | Reformulation du texte preuve de paiement                                  | Très faible                                      | Correctif texte                                                                |
| 7   | Icône afficher/masquer — **tous** les champs mot de passe (4 fichiers)     | Faible                                           | Nouveau composant UI partagé                                                   |
| 8   | Deal Room — ajouter la saisie du budget en €                               | Moyen                                            | Évolution (schéma + formulaire + affichage)                                    |
| 9   | Deal Room — supprimer "Membership minimum" (tout visible à tous)           | Faible                                           | Suppression de champ                                                           |
| 10  | Taux de change Ariary — cours du jour à l'affichage, montant dû figé       | Moyen                                            | Décision et risque **tranchés** (voir §10), prêt à coder                       |
| 11  | Cards annuaire — tri par offre + design distinct pour le tier le plus haut | Moyen                                            | Décision **confirmée**, reste à préciser le tier exact et le visuel (voir §11) |

Toutes les clarifications sont tranchées (30 septembre 2026) — plus aucun point bloquant côté décision produit. Il reste seulement deux détails visuels/techniques mineurs à préciser avant de coder (§10 : vérifier qu'aucun autre endroit du code ne lit `Plan.priceAr` pour un calcul de montant dû ; §11 : quel tier exact et quel style visuel).

---

## 1. Emails — logo texte au lieu du vrai logo CEO Summit

### Comportement attendu

Le vrai logo CEO Summit (fourni par le testeur : `https://www.ceo-summit.mg/wp-content/uploads/2024/08/CEOS26_LOGO_3-2048x544.png`) sur tous les emails envoyés par la plateforme et logo plateforme

### Comportement constaté

Tous les emails affichent un wordmark texte ("**CEO**Summit") au lieu d'une image.

### État réel du code

Tous les emails partagent un seul composant, `emails/components/email-layout.tsx:38-44` :

```tsx
<Section style={{ backgroundColor: COLORS.navy, padding: "24px 32px" }}>
  <Text style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff" }}>
    CEO<span style={{ color: COLORS.gold }}>Summit</span>
  </Text>
  <Text style={{ margin: "2px 0 0", ... }}>Océan Indien · Décideurs</Text>
</Section>
```

**Bonne nouvelle : correctif à un seul endroit.** Remplacer ce `Text` par un `<Img src="..." />` (composant `@react-email/components`, déjà importé ailleurs dans le projet) suffit à mettre à jour les **~15 templates** d'un coup (activation, bienvenue, paiement, invitations, Deal Room, etc.), puisqu'ils passent tous par `EmailLayout`.

Point d'attention : héberger une copie du logo (R2 ou `/public`) plutôt que de pointer vers le CDN WordPress externe fourni par le testeur — un lien direct vers `ceo-summit.mg/wp-content/...` n'est pas garanti stable dans le temps et certains clients mail bloquent les images tierces par défaut.

---

## 2. Email paiement rejeté — texte et bouton

### Comportement constaté / attendu

- Texte : remplacer _"Le paiement soumis pour {companyName} n'a pas pu être validé :"_ par _"Le paiement soumis pour participation au CEO Summit Indian Ocean, 3rd edition n'a pas pu être validé."_
- Bouton : _"Soumettre un nouveau paiement"_ → _"Soumettre à nouveau"_

### État réel du code

`emails/company-payment-rejected-email.tsx:29` et `:46`. Fichier isolé, aucune dépendance — correctif direct.

---

## 3. Email invitation collaborateur — texte

### Comportement constaté / attendu

Remplacer :

> "**{companyName}** vous invite à rejoindre son équipe sur CEO Summit. Acceptez l'invitation pour créer votre compte et accéder à la plateforme — vous choisirez vous-même votre mot de passe à cette étape."

par :

> "CEO Summit vous invite à rejoindre son équipe sur la plateforme de networking du CEO Summit Indian Ocean."

### État réel du code

`emails/company-invite-email.tsx:36-38`.

⚠️ **À confirmer avant d'appliquer tel quel** : le texte de remplacement fourni par le testeur supprime la phrase qui explique que l'invité choisit son propre mot de passe à l'étape suivante. C'est une info utile (évite la confusion "on m'a créé un compte, quel est mon mot de passe ?"). À vérifier si c'est un oubli du testeur ou un choix voulu — sinon on peut garder cette précision en complément du nouveau texte.

---

## 4. Page "Accès en attente" — contact réel

### Comportement attendu

Remplacer la phrase générique par les vraies coordonnées :

```
Une question ? Contactez l'équipe CEO SUMMIT INDIAN OCEAN

038 09 131 14 – register@ceo-summit.mg (inscriptions)
038 01 131 14 – team@ceo-summit.mg (plateforme)
```

### Comportement constaté

Texte actuel : _"Une question ? Contactez l'équipe CEO Summit."_ — pas de coordonnées.

### État réel du code

`app/paiement-en-attente/page.tsx:57-59` (capture testeur à l'appui — écran "Accès en attente" avec la checklist d'onboarding).

---

## 5. Écran de bienvenue — "le cercle" → "Cercle des Décideurs"

### Comportement constaté / attendu

Remplacer "le cercle" par "Cercle des Décideurs" sur l'écran affiché juste après la création du mot de passe.

### État réel du code

`components/onboarding/onboarding-wizard.tsx`, trois occurrences dans `WelcomeStep` et une dans l'étape finale :

- L.152 : `Bienvenue dans le cercle, {firstName}.`
- L.158 : `title="Le Cercle"` (un des 3 "piliers" présentés)
- L.167 : `...réservés aux membres du cercle.`
- L.273 : `Direction votre tableau de bord pour découvrir le cercle.`

À trancher : remplace-t-on **toutes** les occurrences par "Cercle des Décideurs", ou seulement le titre principal (L.152/158) en gardant "cercle" en minuscule dans les phrases descriptives (L.167/273) pour éviter la répétition lourde du nom complet ? Le testeur ne précise que "le cercle" → "Cercle des Décideurs" sans indiquer laquelle des 4 occurrences.

---

## 6. Page paiement entreprise — reformulation du texte preuve de paiement

### Comportement attendu

Remplacer :

> "Choisissez votre mode de paiement, uploadez une preuve (bordereau, reçu, capture) — l'équipe CEO Summit valide manuellement chaque paiement."

par :

> "Choisissez votre mode de paiement. Si 'Virement bancaire ou Chèque', uploadez une pièce justificative (bordereau, ordre de virement, reçu, capture) — l'équipe CEO Summit validera ensuite votre inscription."

### État réel du code

`app/entreprise/paiement/page.tsx:78-83`. Le nouveau texte conditionne explicitement l'upload au mode de paiement "Virement bancaire ou Chèque" — à vérifier que c'est cohérent avec les autres modes de paiement disponibles sur cette page (mobile money ? carte ?) avant d'appliquer, pour ne pas induire en erreur un utilisateur qui choisit un autre mode.

---

## 7. Tous les champs mot de passe — icône afficher/masquer

### Comportement attendu — **portée confirmée par le client (30 sept.)**

Une icône "œil" pour afficher/masquer le mot de passe en clair sur **tous les champs mot de passe de la plateforme**, pas seulement le login : login, création de mot de passe, etc.

### État réel du code

Aucun composant "afficher/masquer mot de passe" n'existe dans le projet. Recherche de tous les `<Input type="password">` — **4 fichiers concernés** :

- `components/auth/login-form.tsx` (connexion)
- `components/auth/set-password-form.tsx` (création du mot de passe — réinitialisation / première connexion)
- `components/auth/company-signup-wizard.tsx` (création de compte entreprise)
- `components/entreprise/accept-invite-button.tsx` (acceptation d'invitation collaborateur — écran vu sur la capture testeur)

À noter : les navigateurs modernes n'affichent plus systématiquement d'icône native sur `<input type="password">` (Chrome l'a retirée il y a plusieurs années ; Firefox la cache derrière un réglage non actif par défaut) — compter sur le natif ne marchera pas de façon fiable, il faut un bouton "œil" custom.

### Piste d'implémentation

Vu que 4 fichiers sont concernés, le plus propre est un composant partagé unique — ex. `components/ui/password-input.tsx` (wrapper autour de `Input` existant, bascule `type="password"`/`type="text"` + icônes `Eye`/`EyeOff` de `lucide-react`, déjà utilisé sur le projet comme `Lock` dans `login-form.tsx`) — puis remplacer le `<Input type="password">` par ce composant dans les 4 fichiers ci-dessus. Évite de dupliquer la logique de bascule 4 fois et garantit un comportement identique partout.

---

## 8. Deal Room — ajouter la saisie du budget en €

### Comportement constaté

Le formulaire de publication d'opportunité (`components/deal-room/publish-wizard.tsx`) n'a qu'un champ "Budget indicatif (Ar)" — pas d'option en euros, contrairement aux offres d'abonnement qui peuvent être cotées en € (`Plan.priceEur`).

### Décision confirmée (30 sept.)

Ajouter une option de saisie du budget en euros — même logique dualité que `Plan.priceAr`/`Plan.priceEur`.

### Ce que ça touche

- **Schéma** : `Opportunity.budget` est aujourd'hui un entier unique (Ariary implicite) — ajouter un champ optionnel équivalent à `priceEur` (ex. `budgetEur Int?`), migration Prisma à prévoir.
- **Formulaire** (`publish-wizard.tsx`) : ajouter le champ de saisie en €, avec conversion d'affichage vers l'Ariary via `lib/currency-conversion.ts` (déjà existant, voir §10) pour l'estimation "≈ X Ar".
- **Affichage** : partout où `Opportunity.budget` est actuellement affiché (liste des opportunités, carte, page détail) — reprendre le même motif que `formatPlanPrice()` (`lib/utils.ts:27-32`) pour un affichage cohérent avec le reste de la plateforme.

---

## 9. Deal Room — flux de notification email et cas "modifications demandées"

### Comportement attendu (rappelé par le testeur)

User crée un Deal Room → admin reçoit une notification email → admin valide → user reçoit une notification que son Deal Room est publié. Et si l'admin demande une modification, l'utilisateur doit pouvoir la faire lui-même (pas de republication immédiate/automatique).

### État réel du code — tout est déjà implémenté

Vérifié dans `app/actions/deal-room.ts` et `app/actions/admin-deal-room.ts` :

- `publishOpportunity` (deal-room.ts:36-86) crée l'opportunité en `PENDING_MODERATION` et envoie un email à `ADMIN_ALERT_EMAIL` (L.66-82).
- `approveOpportunity` (admin-deal-room.ts:33-54) passe le statut à `PUBLISHED` et envoie un email (L.54) à l'auteur.
- **Cas "modifications demandées"** : `requestOpportunityChanges` (admin-deal-room.ts:72-110) passe le statut à `CHANGES_REQUESTED` et envoie un email à l'auteur avec le message de l'admin (`OpportunityChangesRequestedEmail`). Côté auteur, `resubmitOpportunity` (deal-room.ts:323-385) permet de corriger et resoumettre une opportunité `REFUSED` ou `CHANGES_REQUESTED` — elle repasse en `PENDING_MODERATION` et ré-alerte l'admin. Exactement le comportement demandé : l'utilisateur modifie lui-même, ce n'est pas automatique/immédiat.

**Rien à développer ici** — le flux complet (création → alerte admin → validation/demande de modif → notification auteur → correction → resoumission) existe déjà de bout en bout. Si un problème précis a été observé en test (email non reçu, etc.), il faudrait un cas reproductible pour investiguer, mais la mécanique elle-même est en place.

### "Il y a encore Membership minimum" — décision confirmée (30 sept.) : à supprimer

Le testeur confirme : le champ "Membership minimum pour voir cette opportunité" doit être **retiré**. Tout Deal Room publié doit être visible par **tous les membres**, sans restriction de tier.

Ce que ça touche :

- `components/deal-room/publish-wizard.tsx:30-34` (`TIERS`) et le champ de sélection associé dans le formulaire — à retirer de l'UI.
- `Opportunity.visibility` (schéma Prisma) — vérifier si on retire la colonne ou si on la garde en gelant sa valeur (ex. toujours `MEMBER`) pour ne pas casser les enregistrements existants ; la 2ᵉ option est plus sûre (pas de migration destructive).
- Toute la logique de filtrage par tier côté lecture — vue liste (`allowedVisibilities()`), page détail (`app/deal-room/[id]/page.tsx:62`, commentée "défense en profondeur"), et `contactOpportunityAuthor` (deal-room.ts:123-126) qui vérifie aussi le tier avant d'autoriser un contact. Ces trois points de contrôle doivent soit être retirés, soit neutralisés proprement (ex. `allowedVisibilities()` retourne toujours "tout autorisé").

---

## 10. Convertisseur Ariary — passer au cours du jour partout

### Décision confirmée (30 sept.)

> "Le taux de conversion en Ariary doit suivre le cours réel du jour, partout sur la plateforme" — et préciser dans les textes affichés "selon cours du jour" plutôt qu'une formulation vague.

Donc : **Option B** (voir ci-dessous) est retenue — recalcul dynamique, pas de valeur figée à la création de l'offre.

### État réel du code

Il existe déjà un mécanisme de taux de change en direct, `lib/currency-conversion.ts` (API `open.er-api.com`, cache 1h, taux de secours fixe si l'API est indisponible) — mais il n'est utilisé qu'une fois, au moment où un admin crée/modifie une offre cotée en € (`Plan.priceEur`), pour calculer `Plan.priceAr` **à cet instant précis** (`schema.prisma:340-348`). Une fois l'offre créée, `priceAr` reste figé jusqu'à la prochaine modification manuelle — c'est cette valeur figée que le testeur signale.

### Risque précis si le montant dû suit le cours du jour (question du 30 sept.)

Vérifié dans `lib/company-payment-amount.ts:34-36` — `computeDueAmount()` lit `plan.priceAr` **en direct** à chaque appel, il n'existe **aucun snapshot** du montant au moment où une entreprise s'abonne. Concrètement, si `Plan.priceAr` se met à jour tout seul selon le cours du jour (au lieu d'être figé par l'admin), voici le scénario à risque :

1. Une entreprise voit "500 000 Ar" sur sa page de paiement un lundi, fait un virement bancaire de exactement ce montant depuis sa banque (délai de traitement bancaire : souvent 1 à 3 jours).
2. Le cours EUR→Ar bouge entre-temps (fluctuations normales, quelques % par semaine possibles).
3. Quand l'admin va valider la preuve de paiement le mercredi, la page affiche désormais "512 000 Ar" (recalculé au cours du jour) — **alors que le virement reçu est bien le bon montant, celui du lundi.** L'admin n'a plus de référence fiable pour savoir si le paiement reçu est correct : il verrait un écart qui n'existe pas réellement, ou pire, rejetterait à tort un paiement valide.

C'est le seul vrai risque, et il ne concerne que le **montant dû/facturé**, pas l'affichage en général. Si le cours du jour s'applique uniquement à l'**affichage informatif** (pages publiques, estimation "≈ X Ar" à côté d'un prix en €) sans toucher au montant réellement dû une fois qu'une entreprise est engagée dans un paiement, il n'y a pas de risque financier — seulement un affichage qui varie légèrement d'un jour à l'autre sur les pages de présentation, ce qui est normal et même attendu pour du "cours du jour".

**Décision retenue** : cours du jour pour tout affichage (pages publiques, estimations) ; le montant dû/facturé pour une entreprise déjà engagée dans un paiement reste figé à sa valeur au moment de la création de l'abonnement (comportement actuel de `Plan.priceAr`, à ne pas changer) — évite le scénario ci-dessus sans sacrifier la demande d'affichage en cours du jour.

---

## 11. Annuaire des membres — différencier les cards par offre

### Comportement constaté

Sur la page catalogue/annuaire (capture testeur), toutes les cards se ressemblent visuellement quel que soit le compte — y compris des comptes de test nommés explicitement pour représenter différents tiers ("Bronze membre", "ceo Platinum Test", "Pass Test").

### Décision confirmée (30 sept.)

Différencier par **offre** (le plan/tier d'abonnement de l'entreprise du membre — Bronze / Executive / Platinum / Groupement, etc.), pas par le rôle individuel.

### État réel du code

`components/catalogue/member-card.tsx` affiche aujourd'hui un badge de **rôle** (`MEMBER`/`EXECUTIVE`/`CHAIRMAN`, via `TIER_BADGE` + `tierLabel()`) et un badge pays — mais rien sur l'offre souscrite par l'entreprise. Il faut :

- Faire remonter l'info d'offre jusqu'au composant : `MemberCard` ne reçoit aujourd'hui que `role`, `companyName`, `country` etc. — ajouter le plan de l'entreprise (`Company.subscription.plan`) à la requête qui alimente la liste (à localiser : la page qui utilise `MemberCard`, probablement `app/catalogue/page.tsx`) et le passer en prop.

### Design confirmé (30 sept.)

- **Tri de la liste** : par offre décroissante — l'offre la plus chère (ex. Executive/Platinum) en premier, jusqu'à la moins chère (Bronze) en dernier. Nécessite de trier la requête par `plan.priceAr` (ou un ordre de tier explicite) plutôt que l'ordre actuel (vraisemblablement alphabétique ou par date).
- **Design des cards** : garder le design actuel de `MemberCard` pour la majorité des membres — seul le tier le plus élevé ("l'utilisateur en question", à préciser : Executive ? Platinum ? Chairman ?) reçoit un traitement visuel différent (badge/bordure distinctive). Pas de refonte générale de toutes les cards par tier, juste une mise en avant du haut de gamme.

⚠️ **Reste à préciser avant de coder** : quel(s) tier(s) exactement déclenche(nt) le design alternatif (un seul tier au sommet, ou plusieurs), et à quoi ressemble ce design différent (couleur de bordure/fond, badge, icône) ? Pas de proposition visuelle fournie — utile d'avoir une référence ou une description avant l'implémentation.

---

## Prochaines étapes

Toutes les décisions produit sont prises (30 septembre 2026). Il reste deux petits points à préciser en cours de route, sans bloquer le démarrage :

- §10 : au moment de coder, vérifier qu'aucun autre endroit du code ne lit `Plan.priceAr` pour un calcul de montant dû au-delà de `computeDueAmount()` — pour être sûr de ne rien casser en gardant ce montant figé pendant qu'on rend l'affichage dynamique.
- §11 : préciser quel tier exact déclenche le design alternatif et à quoi il ressemble (couleur/badge/icône) — peut se faire juste avant d'attaquer ce point, pas besoin de le savoir dès maintenant.

Ordre de traitement suggéré : **1 → 6** (textes/logo, rapides, zéro risque) → **7** (composant mot de passe partagé) → **9** (suppression Membership minimum) → **8** (budget € Deal Room) → **11** (tri + design cards) → **10** (le plus délicat, touche à la validation des paiements — à faire en dernier et avec précaution).
