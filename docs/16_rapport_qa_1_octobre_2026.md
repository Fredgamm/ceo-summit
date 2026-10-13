# Module 16 — Cahier de recette QA du 1er octobre 2026

> **Statut :** Cahier de recette initial entièrement traité en local — §4 (sélecteurs secteur/pays, ajouté le 1er octobre au soir) décidé, catalogues complets fournis, pas encore codé — rien poussé/déployé en production
> **Version :** 1.0
> **Date :** 1er octobre 2026
> **Source :** Cahier de recette QA client, environnement Production (`app.ceo-summit.mg`)
> **Méthode :** même format que les modules `12`, `14`, `15` — attendu vs constaté, puis état réel du code

---

## 0. Vue d'ensemble

| #    | Sujet                                                                       | Effort      | Statut                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Secteur/Pays "Autre"                                                        | —           | ❌ Écarté — demander au client les valeurs manquantes plutôt que construire une saisie libre                                                               |
| 1.2  | "1 participants" → "1 participant" (singulier)                              | Très faible | ✅ Corrigé en local (5 endroits, `5ca5c26`)                                                                                                                |
| 1.3a | € principal / Ar secondaire sur l'écran de paiement actif                   | Moyen       | ✅ Corrigé en local (`a216995`) — vérifié visuellement                                                                                                     |
| 1.4  | Liens `tel:`/`mailto:` sur "Accès en attente"                               | Très faible | ✅ Corrigé en local (`f842ae7`)                                                                                                                            |
| 2.1  | "Gestion" → "Gestion compte"                                                | Très faible | ✅ Corrigé en local (`42963ad`)                                                                                                                            |
| 2.2  | Bouton/onglet "Aperçu" en édition entreprise                                | Élevé       | ✅ Corrigé en local (`42963ad`) — vérifié visuellement                                                                                                     |
| 2.3  | Champ "Secteur" sur le profil entreprise                                    | —           | **Déjà fait** (formulaire + base), se résout avec 2.2                                                                                                      |
| 2.4  | Deal Room — "mes opportunités d'abord" + tri par secteur d'entreprise       | Moyen       | ✅ Corrigé en local (`a7c7b1e`)                                                                                                                            |
| 2.4b | Bouton "Publier une opportunité"                                            | —           | **Déjà fait**, rien à ajouter                                                                                                                              |
| 2.5  | Onglet "Services" — le gérant ajoute/modifie les services de son entreprise | Moyen       | ✅ Corrigé en local (`00cf80f`) — vérifié de bout en bout                                                                                                  |
| 3.1  | Retirer l'onglet admin "Adhésions"                                          | Très faible | ✅ Corrigé en local (`f842ae7`)                                                                                                                            |
| 3.2a | Pièces jointes sur les broadcasts                                           | Moyen       | ✅ Corrigé en local (`4449a03`) — vérifié visuellement (upload + résolution des liens signés)                                                              |
| 3.2b | Cibler un broadcast par offre(s)                                            | Moyen       | ✅ Corrigé en local (`4449a03`) — vérifié visuellement                                                                                                     |
| 3.3  | Aperçu des templates d'email                                                | Moyen       | ✅ Corrigé en local (`4b78c84`) — vérifié visuellement                                                                                                     |
| 4    | Sélecteurs secteur/pays — afficher 10 valeurs + recherche                   | Élevé       | ✅ Codé en local le 7 octobre (`b10fb4f`, branche `feat/audit17-decisions`) — catalogues importés tels que proposés, relecture client toujours souhaitable |

**Cahier de recette initial entièrement traité — hors §1.1 (écarté) et §4 (nouvelle demande du soir, en décision).**

---

## 1. Parcours Inscription & Sélection d'Offre

### 1.1 Secteur/Pays "Autre" — écarté

**Demandé initialement :** quand l'utilisateur choisit "Autre" dans les select Secteur/Pays, afficher un champ texte libre pour préciser.

**Décision (1er octobre) :** ne pas construire de saisie libre — ça aurait nécessité d'assouplir la validation serveur (`validateSectorAndCountry` dans `app/actions/company.ts`/`profile.ts`, qui rejette aujourd'hui toute valeur hors référentiel) et aurait pollué les données (texte libre non normalisé dans les filtres admin, les fiches entreprise, etc.).

**Plus simple** : demander à CEO Summit quels sont les secteurs et pays les plus utilisés actuellement couverts par "Autre", et les ajouter comme options normales aux référentiels admin-éditables existants (`lib/referentials-query.ts`, déjà géré depuis `/admin/parametres`). Aucune saisie libre, aucun changement de schéma — juste compléter les listes avec les vraies valeurs manquantes.

---

### 1.2 "1 participants inclus" → singulier — ✅ corrigé

**Demandé :** corriger l'accord sur les offres Early Bird et Executive Pass (toutes deux à 1 participant, `prisma/seed.ts:213-219`), y compris "À partir de 1 participants" sur Executive Pass.

**Corrigé** (commit `5ca5c26`) — nouveau helper `pluralize(n, "participant")` dans `lib/utils.ts`, appliqué aux 5 endroits concernés :

- `components/entreprise/plan-picker.tsx` — "X participants inclus" et "À partir de X participants" (cartes de `/entreprise/paiement`)
- `components/auth/company-signup-wizard.tsx` — cartes d'inscription
- `components/entreprise/payment-proof-form.tsx` — récapitulatif de paiement (3 occurrences : quantité groupement, forfait inclus, seuil minimum)
- `app/entreprise/paiement/page.tsx` — texte d'intro

Vérifié visuellement en local : "Early Bird" affiche désormais "1 participant inclus".

---

### 1.3 Hiérarchie des devises sur l'interface de paiement

**Demandé :** € en principal, Ariary en sous-texte avec "— se référer au cours du jour" partout sur l'interface de paiement ; corriger une coquille "participantis"/"prticipantős".

**État réel du code :**

Le composant `components/entreprise/plan-price.tsx` existe et fait exactement ça (€ principal, Ar en petit avec la mention) — **déjà implémenté le 30 septembre** (module 15) sur les cartes de choix d'offre : `plan-picker.tsx:75-79` et `company-signup-wizard.tsx:82-90`.

**Mais il manque sur l'écran de paiement actif** (une fois une offre déjà souscrite) :

1. `app/entreprise/paiement/page.tsx:76-86` — le texte d'intro de la page n'utilise que `formatAriary`, jamais le composant `PlanPrice`.
2. `components/entreprise/payment-proof-form.tsx` — ne reçoit même pas `priceEur`/`liveEurToArRate` en props ; le "Montant dû" (ligne ~230) n'affiche que de l'Ariary.
3. `components/entreprise/upsell-purchase-form.tsx` — le prix unitaire utilise déjà `formatPlanPriceLive` (donc le €), mais le "Montant dû" final retombe sur `formatAriary` seul.

**Décision (1er octobre) : le montant en euros est privilégié partout.** Faire transiter `priceEur`/`liveEurToArRate` (déjà calculé côté page serveur, `getEurToArRate()` est déjà appelé dans `app/entreprise/paiement/page.tsx:50`) jusqu'à `PaymentProofForm` et `UpsellPurchaseForm`, et remplacer les `formatAriary` concernés par `PlanPrice` (ou un affichage équivalent) — y compris le "Montant dû" final, pas seulement le prix unitaire.

**Coquille "participantis"/"prticipantős"** : recherche large sur `app/`, `components/`, `lib/` — **aucune occurrence trouvée**, ni la forme exacte ni une variante proche. Soit déjà corrigée entre-temps, soit le testeur visait autre chose. Rien à faire sans un cas précis (capture d'écran, URL) pour la retrouver.

---

### 1.4 Écran "Accès en attente" — liens cliquables

**Demandé :** rendre les téléphones/emails cliquables (`tel:`/`mailto:`), améliorer la lisibilité du bloc contact.

**État réel du code :** `app/paiement-en-attente/page.tsx:57-61` — texte brut confirmé, aucun lien. Ce bloc avait déjà été mis à jour le 30 septembre (ajout des vraies coordonnées) mais sans liens cliquables.

**Pas de décision produit** — juste transformer en `<a href="tel:...">` / `<a href="mailto:...">`. Seul point mineur à confirmer : le format exact du numéro pour un lien `tel:` international (`tel:+2613809131114` ou la forme locale `tel:0380913114`) — les deux fonctionnent sur mobile, le préfixe `+261` est plus robuste si jamais un membre appelle depuis l'étranger.

---

## 2. Espace "Mon Entreprise" & Deal Room

### 2.1 "Gestion" → "Gestion compte" — confirmé

**Confirmé (capture à l'appui)** : c'est bien l'onglet (`TabsTrigger`) de `app/entreprises/[id]/page.tsx:175`, sur la fiche entreprise visible par le gérant (à côté de "Aperçu", "Membres", "Opportunités", "Services") — pas la section du menu admin/back-office (`components/layout/admin-sidebar.tsx:94`).

Changement trivial : renommer le libellé de cet onglet.

---

### 2.2 Bouton/onglet "Aperçu" pendant l'édition du profil entreprise

**Demandé :** un bouton/onglet "Aperçu" permettant au gérant de voir sa fiche entreprise publique tout en l'éditant.

**Découverte importante : la page d'édition de la fiche entreprise n'existe pas du tout en UI aujourd'hui.**

- `components/entreprise/company-form.tsx` est un formulaire complet (nom, secteur, pays, site web, téléphone, adresse, réseaux sociaux, description) qui supporte déjà `mode: "create" | "edit"`.
- `app/actions/company.ts::updateCompany()` (lignes 134-165) est déjà fonctionnel côté serveur (vérifie que l'appelant est bien `companyAdmin`, valide secteur/pays, met à jour).
- **Mais aucune route ne monte `<CompanyForm mode="edit" />`** — seul `app/entreprise/creer/page.tsx` l'utilise, en mode création. Le composant et l'action backend sont prêts mais orphelins.
- `app/entreprises/[id]/page.tsx` a déjà un système d'onglets (`Tabs` shadcn) : `apercu` (déjà nommé ainsi, lecture seule), `membres`, `deal-room` (placeholder), `services` (placeholder), `gestion` (abonnement/invitations, pour le gérant).

**Décision (1er octobre) : option A retenue.** Un nouvel onglet "Modifier" dans `entreprises/[id]/page.tsx`, à côté de l'onglet "Gestion"/"Gestion compte" (§2.1), qui monte `CompanyForm mode="edit"`. L'onglet "Aperçu" existe déjà juste à côté dans le même système d'onglets — le "aller-retour" demandé devient trivial une fois ce nouvel onglet câblé à `updateCompany()` (déjà fonctionnel côté serveur).

---

### 2.3 Champ "Secteur" sur le profil entreprise

**Déjà fait, des deux côtés** :

- `components/entreprise/company-form.tsx:166-180` — select Secteur, référentiel admin-éditable.
- `prisma/schema.prisma:417` — `Company.sector String` (obligatoire, indexé).

Ce champ n'est actuellement exposé que sur la page de **création** (`/entreprise/creer`) — pas en édition, puisque l'édition n'existe pas en UI (voir §2.2 juste au-dessus). Une fois 2.2 réglé, ce point se résout de lui-même : rien à construire spécifiquement pour "Secteur".

---

### 2.4 Deal Room — priorisation des opportunités

**Demandé :** afficher en priorité (1) les opportunités créées par l'utilisateur/son entreprise, (2) celles qui correspondent au "secteur d'intérêt" de l'entreprise. Ajouter un bouton "Publier une opportunité".

**Bouton "Publier une opportunité" : déjà présent.** `app/deal-room/page.tsx:86-90`, pointe vers `/deal-room/publier` qui existe. Rien à faire.

**Tri actuel** (`lib/deal-room-query.ts::buildDealRoomQuery`, lignes 59-106) : uniquement budget croissant/décroissant, échéance, ou date de création — **aucune notion de priorité "mes opportunités" ni "secteur d'intérêt"** aujourd'hui, le tri est identique pour tout le monde.

**"Secteur d'intérêt d'entreprise" — concept absent du schéma.** `Company` n'a qu'un seul champ `sector` (secteur d'activité, obligatoire, `prisma/schema.prisma:414-452`). Le concept de "secteurs d'intérêt" existe bien dans le schéma, mais **au niveau `User`, pas `Company`** : `User.sectors String[]` (ligne 168, "secteurs d'intérêt", déjà éditable dans `components/profile/profile-edit-form.tsx`).

**Décision (1er octobre) — les deux volets confirmés, prêts à coder :**

1. **"Mes opportunités d'abord"** : faisable sans migration (`Opportunity.authorId → User.companyId`) — logique de tri à deux niveaux dans `buildDealRoomQuery`/l'affichage.
2. **Tri par secteur** : utilise `Company.sector` (le secteur d'activité de l'entreprise, pas `User.sectors`) — on compare le secteur de l'entreprise du membre connecté à celui de l'entreprise auteure de l'opportunité. Un seul champ à gérer, déjà modifiable par le gérant via l'onglet d'édition (§2.2/§2.3), pas de migration nécessaire.

Ordre de priorité résultant pour le tri Deal Room : (1) mes propres opportunités, (2) celles d'entreprises du même secteur que la mienne, (3) le reste (tri budget/échéance/date existant, inchangé).

---

### 2.5 Onglet "Services" — le gérant ajoute/modifie les services de son entreprise

**Demandé (1er octobre, capture à l'appui) :** l'onglet "Services" de la fiche entreprise (`app/entreprises/[id]/page.tsx`) affiche actuellement un simple placeholder ("Bientôt disponible") — le gérant doit pouvoir y ajouter et modifier les services proposés par son entreprise.

**État réel du code :**

- L'onglet est un placeholder assumé (`app/entreprises/[id]/page.tsx:56-58`, commentaire : _"Deal Room and Services tabs are placeholders... don't exist plus"_) — `EmptyState` statique, lignes 217-223.
- Le modèle `ServiceListing` existe déjà en base (`prisma/schema.prisma:949-965`) : `title`, `category`, `description`, `priceInfo`, `gallery`, `status` (`DRAFT`/`PENDING_MODERATION`/`PUBLISHED`/`REFUSED`), lié à `companyId` (optionnel) et `authorId`.
- Un flux de **création** complet existe déjà : `/catalogue/services/publier` monte `components/catalogue-services/service-form-wizard.tsx` (wizard 3 étapes), validé par `lib/validations/service.ts::serviceFormSchema`, soumis via `app/actions/services.ts::submitServiceListing`.
- **Mais `ServiceFormWizard` ne supporte pas l'édition** — contrairement à `CompanyForm` (mode `"create" | "edit"`), il n'a ni prop `mode`, ni `initialValues`, ni `serviceId` : il crée toujours une nouvelle fiche.
- **Aucune action serveur d'édition ou de suppression n'existe** (`app/actions/services.ts` ne contient que `submitServiceListing`). `app/actions/admin-services.ts` a bien `approveServiceListing`/`rejectServiceListing`, mais ce sont des actions **admin plateforme** (changent juste le statut), pas des actions pour le gérant de l'entreprise.
- **Règle métier existante à faire évoluer** : `submitServiceListing` limite aujourd'hui à **une seule fiche active** (`PENDING_MODERATION` ou `PUBLISHED`) par entreprise pour les tiers Member/Executive (illimité pour Chairman) — cette limite à 1 doit sauter (voir décision ci-dessous), sans nécessairement retirer la distinction de palier (un plafond différent par tier reste possible si voulu, à défaut la limite disparaît simplement).
- Récupérer les services d'une entreprise donnée est trivial (aucune fonction dédiée n'existe, mais le pattern `prisma.serviceListing.findMany({ where: { companyId } })` est déjà utilisé tel quel dans `app/catalogue/services/page.tsx`).

**Décision (1er octobre) : plusieurs services par entreprise, visibles des autres utilisateurs.**

**Ce que ça touche :**

1. Retirer la limite "1 fiche active" dans `submitServiceListing` (`app/actions/services.ts`) pour permettre plusieurs services par entreprise.
2. Charger les services de l'entreprise dans `app/entreprises/[id]/page.tsx` : tous les statuts pour le `companyAdmin` (pour qu'il voie/édite ses brouillons et fiches en attente), seulement `status: "PUBLISHED"` pour les autres visiteurs (membres consultant la fiche d'une autre entreprise) — cohérent avec ce qui est déjà visible pour tous dans `/catalogue/services`.
3. Étendre `ServiceFormWizard` pour supporter un mode édition (`mode`/`initialValues`/`serviceId`, sur le modèle de `CompanyForm`).
4. Créer `updateServiceListing()` et `deleteServiceListing()` dans `app/actions/services.ts` — le contrôle d'accès et la validation de `submitServiceListing` servent de gabarit direct. Pas de soft-delete dans le schéma actuel (pas de statut "archivé") : une suppression serait un vrai `delete` Prisma, sauf si on préfère ajouter un statut.
5. Remplacer le placeholder par l'affichage réel : liste des services (cartes `service-card.tsx`, déjà existant) + bouton "Ajouter un service" visible seulement si `isCompanyAdmin` (déjà calculé sur cette page), boutons Modifier/Supprimer sur chaque carte pour le gérant uniquement.

---

## 3. Panneau d'Administration

### 3.1 Retirer l'onglet "Adhésions"

**État réel du code — lien mort depuis le départ :**

- `components/layout/admin-sidebar.tsx:84` pointe vers `/admin/adhesions`.
- **Cette route n'existe pas** (`app/admin/*` ne contient aucun dossier `adhesions`) — cliquer dessus donne un 404 aujourd'hui en production.
- Le libellé "adhesions" existe aussi comme section RBAC : `lib/admin-rbac.ts:23` (liste des sections) et `:42` (le rôle FINANCIER y a "accès"), plus le test `lib/admin-rbac.test.ts:46`.
- L'icône `IdCard` importée pour ce lien (ligne 20) n'est utilisée nulle part ailleurs.

**Pas de décision produit** — pur nettoyage, rien à démonter puisque la fonctionnalité n'a jamais existé derrière ce lien : retirer l'entrée de menu, les 2 références dans `admin-rbac.ts`, l'import `IdCard` inutilisé, et ajuster le test.

---

### 3.2 Broadcast — pièces jointes et ciblage

#### 3.2a Pièces jointes — ✅ Corrigé en local (`4449a03`)

**Implémenté tel que décidé** : lien signé R2 dans le corps du mail (pas de pièce jointe binaire réelle). Nouvelle route `app/api/broadcasts/attachment/route.ts` (upload vers R2, même pattern que `rooms`/`deal-room`), nouvelle colonne `Broadcast.attachmentKeys` (migration `20261001123000_broadcast_attachment_keys`), `resolveAttachmentLinks()` dans `app/actions/broadcasts.ts` (filtre les clés via `isKeyUnderPrefix(key, "broadcasts/")`, résout chaque clé valide en URL signée longue durée — `BROADCAST_ATTACHMENT_LINK_TTL_SECONDS` = 7 jours, car le destinataire peut ouvrir l'email plusieurs jours après l'envoi), `emails/broadcast-email.tsx` affiche la liste des pièces jointes en liens cliquables.

Vérifié visuellement : upload réel d'un fichier dans le composer, apparition dans la liste avec "Retirer". Le test SMTP réel ("Tester") échoue en local sur `admin@ceo-summit.mg` — boîte non provisionnée sur le vrai serveur SMTP (`550 User unknown in virtual mailbox table`), confirmé indépendant du code (la résolution des liens signés s'exécute avant l'échec d'envoi). Couverture ajoutée dans `app/actions/broadcasts.test.ts` (résolution des clés valides, filtrage des clés hors préfixe, persistance de `attachmentKeys`).

#### 3.2b Ciblage par offre(s) — ✅ Corrigé en local (`4449a03`)

**Implémenté tel que décidé** :

- Segments `CHAIRMAN`/`EXECUTIVE` retirés de l'UI du composer (le select ne propose plus que "Tous les membres actifs" / "Segment personnalisé") — valeurs d'enum Prisma `BroadcastSegment` conservées pour ne pas casser l'historique des broadcasts déjà envoyés.
- "Segment personnalisé" permet de sélectionner **plusieurs offres** à la fois via une liste à cases à cocher (`prisma.plan.findMany`, même pattern que `sectors`/`countries`).
- "Tous les membres actifs" reste l'option par défaut.

`lib/broadcast-segments.ts::buildBroadcastRecipientsWhere` filtre désormais par `planIds: string[]` (`where.company.subscription.planId: { in: planIds }`), `getCustomSegmentCount()` et `sendBroadcast()` (`app/actions/broadcasts.ts`) exposent ce paramètre, nouvelle colonne `Broadcast.segmentPlanIds` (migration `20261001120000_broadcast_segment_plan_ids`) pour tracer les offres ciblées sur chaque broadcast créé.

Vérifié visuellement : la liste "Segment personnalisé" affiche bien les vrais noms d'offres ("Chairman (démo)", "Platinum", "MEMBER", "EXECUTIVE", "Light corporate pass 10", "Gold", "Silver", etc.).

---

### 3.3 Templates d'emails — ✅ Corrigé en local (`4b78c84`)

**Les templates d'emails sont 100% en dur dans le code** : 37 fichiers `.tsx` dans `emails/` (un composant React par email), texte/mise en page/interpolations directement en JSX — aucun modèle Prisma `EmailTemplate`, aucun mécanisme de stockage éditable en base.

**Implémenté tel que décidé : aperçu dynamique seul, pas d'édition de texte depuis l'admin.** L'onglet "Templates automatiques" de `/admin/communications` (pas `/admin/parametres`, finalement — c'était déjà le bon endroit pour ce contenu) affiche, pour chacun des 4 templates actifs, un bouton "Aperçu" qui bascule une `<iframe>` sandboxée contenant le HTML déjà rendu côté serveur (`@react-email/render`) avec les props de démo de chaque composant. Les 2 templates non automatisés (rappel événement, renouvellement abonnement) n'ont pas de bouton, faute de composant associé.

Nouveau composant client `components/admin/communications/template-preview.tsx` (toggle + iframe). Vérifié visuellement : les 4 templates actifs s'affichent correctement avec leur mise en page réelle.

---

## 4. Sélecteurs secteur/pays — afficher 10 valeurs + recherche (demande du 1er octobre, soir)

**Nouvelle demande, hors cahier de recette initial** : partout où l'app affiche un sélecteur de secteur ou de pays, n'afficher par défaut que les 10 valeurs prioritaires. Toujours des valeurs prédéfinies, pas de saisie libre (cohérent avec la décision déjà prise en §1.1).

**Révision du design (1er octobre, plus tard dans la soirée) : pas de valeur "Autre" stockée en base.** Première version du pattern : un 11ᵉ choix "Autre" fixé en dernier, cliquer dessus révélait la liste complète. Problème identifié : "Autre" devenait alors une valeur de référentiel comme une autre, sélectionnable et enregistrable telle quelle (`Company.sector = "Autre"`, `User.country = "Autre"`) — une donnée qui ne dit rien de concret, exactement le problème de saisie non exploitable déjà écarté en §1.1, simplement déplacé d'un champ texte libre vers une valeur figée tout aussi vide de sens.

**Nouveau pattern retenu** : les 10 valeurs prioritaires s'affichent directement (pills/select selon l'écran). À côté, un déclencheur **"Rechercher…"** — purement UI, jamais une valeur de référentiel, jamais enregistré nulle part — ouvre une liste filtrable en direct sur l'ensemble du catalogue complet (les 10 prioritaires y compris, pour pouvoir aussi les retrouver par la recherche). L'utilisateur choisit toujours une vraie valeur prédéfinie, qu'elle soit dans le top 10 ou trouvée par la recherche — jamais "Autre" littéralement.

Vérifié dans le code (grep sur `"Autre"` dans `*.ts`/`*.tsx`) : aucune logique de validation ne traite "Autre" spécialement aujourd'hui, c'est une entrée de référentiel comme une autre dans `prisma/seed.ts` — la retirer est donc un simple changement de données, pas de logique à nettoyer côté serveur. Vérifié aussi en local (1er octobre) : aucune donnée existante (`User`, `Company`, `Opportunity`) ne référence "Autre" pour `sector`/`country` — rien à migrer, la valeur peut être supprimée du référentiel sans orphelin.

#### État réel du code (investigation du 1er octobre, soir)

- **Aucun composant réutilisable** de type `SectorSelect`/`CountrySelect` n'existe. 14 écrans différents consomment `getReferentialLabels("sector"/"country")` et font chacun leur propre `.map()` ad hoc (inscription, demande d'accès, création/édition entreprise, édition profil, onboarding, filtres catalogue/salles/Deal Room, formulaire salle admin, segment personnalisé du broadcast admin, filtres membres admin) — patterns UI différents selon l'endroit (`<Select>` Radix, pills, checkboxes). **Aucun de ces 14 usages ne tronque ou ne pagine** : ils affichent tous la liste complète du référentiel telle quelle aujourd'hui.
- Le tri est déjà géré par `Referential.position` (`orderBy: position asc`, `lib/referentials-query.ts`), hérité par tous les appelants — donc "les 10 premiers" = les 10 premières positions, pas de nouveau champ à ajouter pour ça.
- Une page d'admin de gestion du référentiel existe déjà (`app/admin/parametres/page.tsx`, onglet "Référentiels" + `referential-manager.tsx` + `app/actions/admin-settings.ts`), mais **CRUD minimal : création et suppression uniquement**. Pas de réordonnancement (pas de drag-and-drop, pas de champ `position` éditable) — tout nouvel ajout est automatiquement placé en dernière position (`position: maxPosition + 1`). **Rien ne garantit structurellement que "Autre" reste en dernière position** : c'est vrai aujourd'hui uniquement parce que le seed l'a placé en dernier et que les ajouts vont en fin de liste — un admin pourrait le casser en supprimant/recréant "Autre".

#### Décisions prises (1er octobre, soir)

- **Pays — 10 valeurs prioritaires (zone Océan Indien)** : Madagascar, Île Maurice, La Réunion, Comores, Mayotte, Seychelles, Mozambique, Tanzanie, Kenya, Afrique du Sud. Les 4 derniers sont à ajouter au référentiel (actuellement seuls les 6 premiers existent). **Catalogue complet (liste des pays du monde) donné ci-dessous, ordre cible = ordre de `position`.**
- **Secteurs — 10 valeurs** : les 9 existants (Énergie & Environnement, Finance & Banque, Technologie & Digital, Agroalimentaire & Agriculture, Logistique & Transport, Immobilier & BTP, Santé & Pharmaceutique, Tourisme & Hôtellerie, Industrie & Manufacturing) + **Éducation & Formation** (nouveau). **Catalogue complet donné ci-dessous, ordre cible = ordre de `position`.**
- **"Autre" retiré du référentiel** (sector et country) — à supprimer des 2 entrées locales actuelles (position 9 pour sector, position 6 pour country) lors de l'import du catalogue élargi.

#### Catalogue complet — Pays (ordre cible, position 1 → 195)

**1-10 — prioritaires (déjà actés ci-dessus)** : Madagascar, Île Maurice, La Réunion, Comores, Mayotte, Seychelles, Mozambique, Tanzanie, Kenya, Afrique du Sud.

**11-56 — reste de l'Afrique (alphabétique)** : Algérie, Angola, Bénin, Botswana, Burkina Faso, Burundi, Cameroun, Cap-Vert, Congo, Côte d'Ivoire, Djibouti, Égypte, Érythrée, Eswatini, Éthiopie, Gabon, Gambie, Ghana, Guinée, Guinée équatoriale, Guinée-Bissau, Lesotho, Liberia, Libye, Malawi, Mali, Maroc, Mauritanie, Namibie, Niger, Nigeria, Ouganda, République centrafricaine, République démocratique du Congo, Rwanda, Sao Tomé-et-Principe, Sénégal, Sierra Leone, Somalie, Soudan, Soudan du Sud, Tchad, Togo, Tunisie, Zambie, Zimbabwe.

**57-100 — Europe (alphabétique)** : Albanie, Allemagne, Andorre, Autriche, Belgique, Biélorussie, Bosnie-Herzégovine, Bulgarie, Chypre, Croatie, Danemark, Espagne, Estonie, Finlande, France, Grèce, Hongrie, Irlande, Islande, Italie, Lettonie, Liechtenstein, Lituanie, Luxembourg, Macédoine du Nord, Malte, Moldavie, Monaco, Monténégro, Norvège, Pays-Bas, Pologne, Portugal, République tchèque, Roumanie, Royaume-Uni, Russie, Saint-Marin, Serbie, Slovaquie, Slovénie, Suède, Suisse, Ukraine.

**101-146 — Moyen-Orient & Asie (alphabétique)** : Afghanistan, Arabie saoudite, Arménie, Azerbaïdjan, Bahreïn, Bangladesh, Bhoutan, Birmanie (Myanmar), Brunei, Cambodge, Chine, Corée du Nord, Corée du Sud, Émirats arabes unis, Géorgie, Inde, Indonésie, Irak, Iran, Israël, Japon, Jordanie, Kazakhstan, Kirghizistan, Koweït, Laos, Liban, Malaisie, Maldives, Mongolie, Népal, Oman, Ouzbékistan, Pakistan, Philippines, Qatar, Singapour, Sri Lanka, Syrie, Tadjikistan, Thaïlande, Timor oriental, Turkménistan, Turquie, Vietnam, Yémen.

**147-181 — Amériques (alphabétique)** : Antigua-et-Barbuda, Argentine, Bahamas, Barbade, Belize, Bolivie, Brésil, Canada, Chili, Colombie, Costa Rica, Cuba, Dominique, Équateur, États-Unis, Grenade, Guatemala, Guyana, Haïti, Honduras, Jamaïque, Mexique, Nicaragua, Panama, Paraguay, Pérou, République dominicaine, Saint-Kitts-et-Nevis, Saint-Vincent-et-les-Grenadines, Sainte-Lucie, Salvador, Suriname, Trinité-et-Tobago, Uruguay, Venezuela.

**182-195 — Océanie (alphabétique)** : Australie, Fidji, Îles Marshall, Îles Salomon, Kiribati, Micronésie, Nauru, Nouvelle-Zélande, Palaos, Papouasie-Nouvelle-Guinée, Samoa, Tonga, Tuvalu, Vanuatu.

_Liste des 193 États membres de l'ONU (+ Île Maurice/La Réunion/Mayotte déjà comptés dans le top 10, qui ne sont pas des États souverains mais sont conservés comme valeurs distinctes pour coller à l'usage régional) — compilée de mémoire, à relire/corriger par le client avant import en base (risque d'erreur ou d'oubli sur une liste de cette taille)._

#### Catalogue complet — Secteurs (ordre cible, position 1 → 34)

**1-10 — prioritaires (déjà actés ci-dessus)** : Énergie & Environnement, Finance & Banque, Technologie & Digital, Agroalimentaire & Agriculture, Logistique & Transport, Immobilier & BTP, Santé & Pharmaceutique, Tourisme & Hôtellerie, Industrie & Manufacturing, Éducation & Formation.

**11-34 — catalogue élargi (alphabétique)** : Administration publique & Secteur public, Aéronautique & Aérospatial, Artisanat, Assurance, Automobile, Beauté & Cosmétique, Chimie & Pétrochimie, Commerce & Distribution, Conseil & Services aux entreprises, Culture, Arts & Divertissement, Eau & Assainissement, Économie sociale, solidaire & ONG, Édition & Imprimerie, Événementiel, Juridique & Avocats, Marketing & Publicité, Médias & Communication, Mines & Industries extractives, Mode & Textile, Pêche & Aquaculture, Ressources humaines & Recrutement, Sécurité, Sport, Télécommunications.

_Catalogue élargi construit à partir d'une taxonomie sectorielle standard, avec un accent sur les activités fortement présentes dans l'Océan Indien (Mines, Mode & Textile, Pêche & Aquaculture, Artisanat — zones franches, saphir/nickel à Madagascar, crevetticulture, etc.). Comme pour les pays, à relire/valider par le client avant import en base — certains libellés peuvent mériter un regroupement ou un renommage différent selon les retours terrain._

#### Reste à faire (non codé à ce stade)

1. Supprimer les 2 entrées "Autre" actuelles du référentiel local (sector position 9, country position 6), puis ajouter les 4 nouveaux pays prioritaires + 1 nouveau secteur (Éducation & Formation) en position 7-10.
2. Relire/valider les deux catalogues complets ci-dessus avec le client, puis les importer en base (pays : positions 11-195 ; secteurs : positions 11-34) via un script de seed plutôt qu'à la main dans l'admin.
3. Construire un composant réutilisable (`SectorSelect`/`CountrySelect` ou un seul `ReferentialSelect` générique) qui affiche les 10 premières positions + un déclencheur "Rechercher…" (UI uniquement, jamais une valeur stockée), ouvrant une liste filtrable en direct sur l'ensemble du catalogue (insensible à la casse/aux accents — indispensable sur les ~195 pays, moins critique mais cohérent sur les 34 secteurs) — puis migrer les 14 usages existants dessus (chantier le plus lourd du lot, risque de régression visuelle vu la diversité des patterns UI actuels).
4. Pas besoin de réordonnancement admin pour garantir la position d'"Autre" (le problème disparaît avec la suppression de cette valeur) — mais un réordonnancement reste utile à terme si le client veut ajuster l'ordre des 10 prioritaires sans dépendre de l'ordre de création. Non bloquant, pas nécessaire pour la V1 de ce chantier.

**Ordre d'implémentation prêt à suivre dès le feu vert** : (1) nettoyer le référentiel local — retirer les 2 "Autre", ajouter les 5 valeurs prioritaires manquantes (4 pays + 1 secteur) ; (2) importer les deux catalogues complets via le script de seed dédié ; (3) construire le composant `ReferentialSelect` (10 valeurs + "Rechercher…") ; (4) migrer les 14 écrans existants dessus.

**Statut (7 octobre) : codé en local, commit `b10fb4f` sur la branche `feat/audit17-decisions`, non poussé.**

- Composant `ReferentialSelect` (10 prioritaires + « Rechercher… », recherche sans accents ni casse) et bouton `ReferentialSearchButton` pour les listes en pastilles ; les 14 usages sont migrés.
- Catalogues dans `lib/referential-catalog.ts` (34 secteurs, 195 pays), appliqués par la migration `20261007120000_referential_catalog` au prochain déploiement et repris par le seed.
- « Autre » est supprimé du référentiel s'il n'est utilisé nulle part. Les valeurs ajoutées depuis l'admin passent après le catalogue.
- Reste : relecture des deux catalogues par le client. Une correction se fait depuis `/admin/parametres` ou par une nouvelle migration.

---

## Prochaines étapes

**Module entièrement traité en local** — rien n'est poussé/déployé en production pour ce module (travail resté strictement local sur demande).

1. ~~Corrections triviales~~ — ✅ fait (§1.2, §1.4, §3.1).
2. ~~§2.1/§2.2~~ — ✅ fait.
3. ~~§1.3/§2.4~~ — ✅ fait.
4. ~~§2.5~~ — ✅ fait.
5. ~~§3.2a/§3.2b~~ — ✅ fait (`4449a03`).
6. ~~§3.3~~ — ✅ fait (`4b78c84`).

Reste à décider avec le client : quand pousser/déployer l'ensemble de ce module (actuellement 8 commits locaux sur `mvp-connect-simple`, aucun poussé).
