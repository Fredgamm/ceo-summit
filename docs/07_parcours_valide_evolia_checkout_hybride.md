# Module 07 — Parcours d'achat validé avec Evolia (checkout hybride) et écart avec l'existant

> **Statut :** Parcours cible validé suite à échange avec Evolia — remplace les hypothèses de `04`/`05` sur la forme du checkout, à développer sur `mvp-connect-simple`
> **Version :** 1.0
> **Date :** 2 septembre 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Documents liés :** [`04_demande_information_evolia.md`](./04_demande_information_evolia.md) (proposition initiale envoyée à Evolia — partiellement dépassée, voir §2), [`05_notes_internes_integration_evolia.md`](./05_notes_internes_integration_evolia.md) (questions ouvertes — voir §4 pour ce qui est tranché), [`06_analyse_viabilite_business_mvp.md`](./06_analyse_viabilite_business_mvp.md) (arbitrages business — voir §4)

---

## 1. Parcours validé

Contrairement à la proposition envoyée à Evolia (`04`, "Evolia héberge tout le formulaire d'achat"), le parcours réellement retenu après échange est **hybride** : CEO Summit garde la main sur la page d'offres, l'inscription du gestionnaire et l'entreprise ; Evolia n'intervient que sur la **transaction de paiement** elle-même (quand le mode choisi est carte/mobile money via Evolia).

1. L'utilisateur arrive **sur la plateforme CEO Summit**, sur une page dédiée d'affichage des offres (offres générées manuellement par l'admin — RG de composition/quota à détailler séparément).
2. Il choisit une offre → passe au checkout, **toujours sur la plateforme CEO Summit** (pas de redirection vers un formulaire Evolia).
3. Il s'inscrit en tant que **gestionnaire/responsable du compte entreprise** qu'il représente (nom, prénom, email, entreprise).
4. Selon l'offre, il peut **déjà renseigner les collaborateurs participants** (nom, prénom, email) à cette étape, ou les ajouter plus tard — au choix.
5. Il valide le paiement. **Evolia prend le relais ici uniquement**, via API, pour la transaction de paiement (formulaire carte/mobile money, etc.) — puis rend la main.
6. Evolia notifie le paiement (succès ou échec) à la plateforme CEO Summit (webhook entrant).
7. **Si succès** : accès direct à la plateforme pour le gestionnaire — gestion de son entreprise, ajout de collaborateurs, Deal Room, messagerie, etc.
8. **À chaque évolution de la liste de participants d'une entreprise** (nouveau participant ajouté, y compris le gestionnaire initiateur), un **webhook sortant** envoie à Evolia un **instantané complet** — entreprise (entité racine) + offre souscrite (description, quota, prix) + liste à jour de **tous** les participants de cette entreprise, gestionnaire inclus — pour qu'Evolia génère les QR codes d'accès physique de son côté (CEO Summit ne gère plus lui-même les entrées/sorties ni de contrôle d'accès physique — voir §3). Détail du payload : `08` §4.
9. Chaque participant ajouté reçoit un email d'accès à la plateforme (mécanisme d'invitation existant, voir §5).
10. **Paiement par virement bancaire** : l'admin CEO Summit attend la confirmation (hors Evolia).
11. **Paiement par preuve uploadée** : l'admin CEO Summit peut valider manuellement (hors Evolia).
    > ✅ **Décision (2 septembre 2026)** — ces deux modes déclenchent **aussi** le webhook sortant du point 8, au même titre qu'un paiement via Evolia : tout participant qui obtient l'accès doit être connu d'Evolia, quel que soit le mode de paiement validé. Voir §6.

### Champs systématiquement portés par un participant

Entreprise (rattachement), nom & prénom, rôle/responsabilité, secteur d'activité — le secteur étant un attribut de l'**entreprise**, pas du participant individuellement (cohérent avec le schéma actuel, voir §5).

### Ce qui sort explicitement du périmètre "lite"

- **Crédits Deal Room** (déduction par contact, achat de packs) — retirés pour cette version, réintégrés plus tard.
- **QR code / contrôle d'accès physique / suivi entrée-sortie** — CEO Summit ne gère plus ça ; implicitement du ressort d'Evolia ou hors périmètre de la plateforme.

---

## 2. Écart avec la proposition envoyée à Evolia (`04`)

| Point de la proposition `04`                                                            | Parcours réellement validé                                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Evolia héberge **tout** le formulaire d'achat (nom, prénom, email, organisation, offre) | CEO Summit garde le formulaire d'inscription **et** la gestion entreprise/collaborateurs ; Evolia ne traite **que** la transaction de paiement |
| Un seul webhook entrant (paiement confirmé → création de compte)                        | Webhook entrant (paiement) **+ webhook sortant** (nouveau participant → Evolia), absent de `04`                                                |
| Pas de notion de collaborateurs à ce stade                                              | Pré-remplissage optionnel des collaborateurs **avant** paiement, selon l'offre                                                                 |
| Aucun mode de paiement alternatif mentionné                                             | Virement/preuve restent des voies parallèles, validées par l'admin CEO Summit (hors Evolia)                                                    |

Le payload proposé en `04` §3 (`registrant.firstName/lastName`, `organizationName`, `offerCode`, `reference`) reste probablement réutilisable **pour le webhook entrant** (confirmation de paiement), mais son contexte change : il n'accompagne plus une _création de compte à partir de zéro_ (le compte existe déjà, créé par CEO Summit à l'étape 3 du parcours), il **confirme un paiement déjà rattaché à une entreprise/gestionnaire existants**. Le schéma exact à renvoyer à Evolia est à revoir avant tout nouvel envoi — `04` n'est plus à jour tel quel.

---

## 3. Ce que ça change par rapport à `05`/`06`

`05` (notes internes du 12 août) partait de l'hypothèse "Evolia gère tout en amont, la plateforme ne gère plus aucun paiement ni validation". Le parcours validé ici est **plus nuancé** : CEO Summit garde un rôle actif (formulaire gestionnaire/collaborateurs, deux voies de paiement internes en parallèle d'Evolia) — ce n'est pas un simple point d'entrée passif.

`06` posait deux décisions à trancher avec le client :

1. **Deal Room ouvert à tous ou réservé ?** → Implicitement tranché par ce parcours : plus de tier ni de crédits différenciés en lite, donc **Deal Room ouvert à tout inscrit** par défaut, sauf décision contraire explicite à reconfirmer.
2. **Contrôle d'accès physique sans QR ?** → Confirmé abandonné côté CEO Summit (point 8 du parcours, §1) — probablement reporté sur Evolia ou un autre outil, à clarifier mais **hors périmètre de ce dépôt**.

---

## 4. État de l'implémentation actuelle vs ce parcours

| Brique                                                          | État actuel (code)                                                                                                                | Écart                                                                                                                                                                                                   | Action                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Page d'offres                                                   | Sur le **site vitrine public, hors de ce dépôt** ; la plateforme ne fait que résoudre un lien profond `/inscription?offre=<slug>` | La page doit vivre **dans** la plateforme                                                                                                                                                               | À construire                               |
| Inscription gestionnaire + création entreprise                  | `signup()` + `createCompany()` (Phase 2bis/2ter), déjà transactionnels                                                            | Conforme dans l'esprit                                                                                                                                                                                  | Réutilisable                               |
| Pré-remplissage optionnel des collaborateurs **avant** paiement | `CompanyInvite`/`inviteTeammate` existent mais s'utilisent **après** création de l'entreprise, hors checkout                      | Doit s'intégrer dans le même parcours de checkout, conditionné par l'offre                                                                                                                              | À adapter                                  |
| Checkout Evolia (paiement carte/mobile money via API)           | Inexistant — le webhook Evolia (E1) existant vise `Membership` individuelle, jamais branché sur un achat d'offre entreprise       | Nouveau webhook entrant + nouvelle intégration API sortante vers Evolia pour initier le paiement                                                                                                        | À construire                               |
| Webhook sortant vers Evolia (nouveau participant)               | Inexistant, aucun appel sortant vers Evolia nulle part dans le code                                                               | Nouveau                                                                                                                                                                                                 | À construire                               |
| Activation directe à la confirmation de paiement                | `confirmCompanyPayment` fait déjà exactement ça (accès à tous les collaborateurs déjà rattachés)                                  | Trigger aujourd'hui = clic admin manuel, doit devenir automatique sur webhook Evolia pour le mode carte                                                                                                 | À adapter                                  |
| Virement bancaire / preuve → validation admin manuelle          | Déjà construit (`CompanyPayment`, upload preuve, `confirmCompanyPayment`/`rejectCompanyPayment`)                                  | Conforme — doit en plus déclencher le webhook sortant (§6)                                                                                                                                              | Réutilisable + brancher le webhook sortant |
| Email d'accès à chaque participant ajouté                       | Déjà construit (`CompanyInvite` + email d'invitation)                                                                             | Conforme                                                                                                                                                                                                | Réutilisable                               |
| Champs participant (entreprise, nom/prénom, rôle, secteur)      | `User.name`, `User.title` (libellé "ex: CEO, Directeur Général"), `Company.sector` hérité existent déjà                           | Quasi conforme — `CompanyInvite` n'a pas encore de champ rôle/titre à préremplir avant activation ; `User.name` est un champ unique, pas nom/prénom séparés (à vérifier si Evolia impose la séparation) | Ajustement mineur de schéma probable       |
| Crédits Deal Room                                               | Entièrement construit (E6)                                                                                                        | À désactiver/masquer pour la version lite, **pas supprimer**                                                                                                                                            | Feature flag / descope                     |
| QR code / check-in                                              | Entièrement construit (E3 + caméra E10)                                                                                           | Hors périmètre lite                                                                                                                                                                                     | Descope                                    |

---

## 5. Ce qui est directement réutilisable

- Le mécanisme d'invitation/activation collaborateur (`CompanyInvite`, email, mot de passe choisi à l'acceptation) — déjà exactement le comportement voulu au point 9 du parcours.
- La mécanique de vérification HMAC + idempotence par référence unique du webhook Evolia existant (E1) — réutilisable techniquement pour le nouveau webhook entrant, même si sa cible de données change (`CompanySubscription`, pas `Membership`).
- `confirmCompanyPayment`/`CompanyPayment` pour les voies virement/preuve.
- Le rattachement du secteur à l'entreprise plutôt qu'au participant (déjà le modèle actuel).

---

## 6. Décision — webhook sortant déclenché sur tous les modes de paiement

**Tranché (2 septembre 2026) : oui, virement et preuve déclenchent aussi le webhook sortant vers Evolia.**

Raison : CEO Summit ne gère plus le contrôle d'accès physique/entrées-sorties (point 8, §1) — ce rôle est reporté en aval, chez Evolia. Un participant ajouté via virement/preuve et jamais notifié à Evolia n'existerait dans **aucun** système de contrôle d'accès le jour de l'événement — trou opérationnel, pas seulement un défaut de cohérence des données.

**Point d'attention pour l'implémentation** : garder ce webhook conceptuellement séparé du webhook de confirmation de _paiement_. Il signifie uniquement "ce participant a accès", indépendamment de qui a validé le paiement — pour ne pas polluer la réconciliation financière d'Evolia avec des transactions qu'ils n'ont jamais traitées eux-mêmes.

**Conséquence technique** : un seul point de vérité fonctionnel (ex. `syncCompanyParticipantsToEvolia(company)`, qui reconstruit l'instantané complet — entreprise + offre + tous les participants actuels — plutôt qu'un delta), appelé depuis **deux** points d'entrée — le futur handler du webhook Evolia entrant (paiement confirmé côté Evolia) et `confirmCompanyPayment` (virement/preuve validés côté admin CEO Summit) — et réutilisé aussi à chaque nouvel `inviteTeammate`/acceptation de collaborateur, plutôt que dupliquer la logique d'appel.

---

## 7. Prochaines étapes

1. ~~Trancher la question du §6.~~ Fait — voir §6.
2. Redéfinir le payload du webhook entrant avec Evolia (celui de `04` §3 n'est plus exact — le contexte "compte déjà existant" change ce qu'il faut échanger).
3. Spécifier l'API sortante attendue par Evolia pour initier un paiement depuis notre checkout (non couvert par `04`, qui supposait qu'Evolia hébergeait tout le formulaire).
4. Spécifier le webhook sortant (nouveau participant → Evolia) : payload, authentification, idempotence — symétrique aux exigences déjà posées à Evolia pour le sens entrant. Confirmé déclenché sur les trois chemins de paiement (Evolia, virement, preuve), voir §6.
5. Construire la page d'offres dans la plateforme (actuellement sur le site vitrine hors dépôt).
6. Développement sur la branche `mvp-connect-simple` (cohérent avec la décision de branche du 12 août, `05`).
