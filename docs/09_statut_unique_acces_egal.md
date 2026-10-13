# Module 09 — Décision d'architecture : statut unique, accès égal pour tout membre payé

> **Statut :** Décision produit tranchée — remplace les questions laissées ouvertes par `06_analyse_viabilite_business_mvp.md`
> **Version :** 1.0
> **Date :** 2 septembre 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Documents liés :** [`06_analyse_viabilite_business_mvp.md`](./06_analyse_viabilite_business_mvp.md) (posait la question sans trancher), [`02_parcours_inscription_paiement.md`](./02_parcours_inscription_paiement.md) (modèle Plan/tier actuel), [`07_parcours_valide_evolia_checkout_hybride.md`](./07_parcours_valide_evolia_checkout_hybride.md) (le "produit" vendu ici est celui décrit en §1 de ce module)

---

## 1. La décision

**L'admin définit uniquement des offres (`Plan`)** — chacune avec :

- un nombre de personnes incluses (dynamique, fixé par l'admin à la création),
- un prix.

Ces offres sont **les seuls produits vendus sur la plateforme**, structurés pour qu'Evolia puisse les traiter comme des produits de catalogue (référence, prix — voir `07`/`08`).

**Toute offre payée et validée donne un accès identique à tous les membres qu'elle couvre.** Il n'existe plus de palier d'accès différencié : un membre dont l'entreprise a payé une offre (n'importe laquelle) a accès à l'intégralité des fonctionnalités de la plateforme — Deal Room, messagerie, participation aux événements disponibles, etc. — au même titre que n'importe quel autre membre payé.

En résumé : **payé + validé = accès complet**. Il n'y a plus de "Executive et plus", plus de salle réservée à un palier, plus de visibilité d'opportunité restreinte par tier.

## 2. Ce que ça tranche définitivement

`06` posait deux questions au client sans les trancher :

1. _"Le Deal Room reste-t-il un avantage premium réservé à certains inscrits, ou devient-il ouvert à tout le monde ?"_ → **Ouvert à tout membre payé**, sans distinction.
2. Ne concernait pas ce module (contrôle d'accès physique événement, déjà traité en `07`).

Ça confirme et étend la direction déjà prise dans la conversation Evolia (`08`) : _"plus de crédit pour les contacts etc., on intégrera ces RG plus tard"_ — cohérent avec l'absence totale de mécanisme différencié ici.

## 3. Ce qui devient obsolète dans le code actuel

Cette décision élimine la notion même de "tier", pas seulement un des deux enums qui la codaient en double :

| Élément actuel                                                                   | Devenir                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tier` (enum `MEMBER`/`EXECUTIVE`/`CHAIRMAN`)                                    | Obsolète comme critère d'accès. `Event.minTier`, `Opportunity.visibility` n'ont plus de raison d'être différenciés.                                                                                                                            |
| `RoomAccessLevel` (`ALL_MEMBERS`/`EXECUTIVE_PLUS`/`CHAIRMAN_ONLY`)               | Idem — `Room.minTier` devient "accessible à tout membre payé" par défaut.                                                                                                                                                                      |
| `getViewerTierFromCompany`/`Plan.rank` (dérive un tier depuis l'offre souscrite) | Le rang n'a plus besoin de produire un _palier_ — juste un booléen "a une offre active validée".                                                                                                                                               |
| Gate "achat de crédits réservé Executive+"                                       | Sans objet si les crédits eux-mêmes disparaissent (déjà décidé dans `08` pour la version lite) — à confirmer que ce module s'applique aussi au Deal Room existant, pas seulement au nouveau parcours.                                          |
| Formulaires admin salle/événement (sélecteur de palier)                          | Le champ de sélection de palier n'a plus de sens — soit retiré, soit remplacé par un simple on/off "réservé sponsoring" s'il reste un besoin de restriction ponctuelle hors self-service (cf. `Plan.isSelfService` pour les offres négociées). |

Ce n'est donc pas _"fusionner deux enums qui disent la même chose"_ — c'est _"retirer la notion de palier d'accès elle-même"_, ce qui est plus simple à exécuter (moins de décisions de mapping) mais touche plus large (chaque endroit qui vérifie un tier doit être revu, pas juste renommé).

## 4. Décision — les crédits Deal Room disparaissent aussi

**Tranché (2 septembre 2026) : oui, le système de crédits Deal Room est retiré entièrement**, pas seulement la restriction "achat réservé Executive+". Cohérent avec la décision déjà prise pour le nouveau parcours Evolia (`08` : _"plus de crédit pour les contacts etc., on intégrera ces RG plus tard"_) — confirmé applicable ici aussi, pas seulement au nouveau parcours d'inscription. Contacter l'auteur d'une opportunité devient gratuit et illimité pour tout membre payé et validé.

Conséquence sur le code actuel : `CreditBalance`, `CreditTransaction`, `CreditPurchase`, `withCreditDeductionLock`, la page `/credits/acheter`, `/admin/credits`, et la déduction dans `contactOpportunityAuthor` (`app/actions/deal-room.ts`) deviennent tous du code à désactiver/retirer, pas seulement à assouplir. Ces règles de gestion "seront réintégrées plus tard" par décision produit — ne pas supprimer le code sans discussion, mais le sortir du chemin actif.

## 5. Stratégie d'exécution retenue (2 septembre 2026) — chirurgicale, pas une purge de schéma

Un inventaire complet du code (`app/`, branche `mvp-connect-simple`) a montré que retirer réellement les colonnes/enums `Tier`/`RoomAccessLevel`/`minTier`/`visibility` toucherait 50+ fichiers (schéma, requêtes, ~15 pages membre, 6 formulaires admin, 28 fichiers de test) pour un gain nul par rapport à une approche plus ciblée.

**Constat clé** : `getViewerTierFromCompany()` renvoie déjà soit un tier, soit `null` — et `null` signifie déjà exactement "pas d'offre active/validée" (`TIER_ELIGIBLE_STATUSES = ["ACTIVE","EXPIRED"]`, RG-12). La brique "a payé et validé" existe donc déjà ; elle sert aujourd'hui à calculer _quel_ palier plutôt que _si_ palier.

**Décision** : ne pas toucher au schéma ni aux colonnes `minTier`/`visibility` (elles restent en base, inutilisées — même traitement que `Tier` lui-même ou `Event.minPlanId`, déjà "legacy" documentés dans ce projet sans avoir été purgés). À la place :

1. **3 fonctions de porte changent de sens** (comparaison de rang → présence d'un accès) :
   - `lib/rooms-query.ts::meetsRoomAccess` — accepte tout viewer avec un tier non nul, ignore `minTier`.
   - `lib/deal-room-query.ts::allowedVisibilities` — retourne toutes les valeurs de `Tier` dès qu'un tier existe (au lieu d'un sous-ensemble), `[]` sinon.
   - `lib/utils.ts::meetsMinTier` — même principe pour les événements.
2. **Crédits Deal Room retirés du chemin actif, pas supprimés** : `contactOpportunityAuthor` (`app/actions/deal-room.ts`) devient gratuit/illimité (plus de verrou, plus de déduction, plus de blocage sur solde insuffisant) ; les pages `/credits/acheter` et `/admin/credits` sont retirées de la navigation. Le schéma (`CreditBalance`/`CreditTransaction`/`CreditPurchase`/`CreditPackPrice`), les fichiers d'action (`app/actions/credits.ts`, `lib/payment-confirmations.ts::confirmCreditPurchaseCore`) restent intacts pour une réintégration future.
3. **Les badges UI qui promettent un palier disparaissent** ("Executive et plus requis", badge de tier sur une salle/opportunité/événement) — sinon l'interface mentirait sur un filtre qui n'existe plus.
4. **Cas particulier harmonisé** : `services.ts` autorisait une entreprise Chairman à garder plusieurs fiches service actives simultanément (bypass de quota). Sans palier, la règle devient la même pour tout le monde (une fiche active à la fois).
5. **Hors périmètre, volontairement non touché** : `BroadcastSegment` (ciblage d'email, logique métier différente de l'accès plateforme), le webhook Evolia legacy (`lib/validations/webhooks.ts`, contrat externe déjà en cours de renégociation via `07`/`08`), `Plan.rank` comme clé de tri de l'offre (encore utile, indépendant du tier), `tierLabel()` (encore utile pour `Role`/`requestedTier`/affichage divers au-delà du gating retiré).

Réalisé directement sur `mvp-connect-simple` (`e:\Developpement\B2B plateforme\app`) — pas de nouvelle branche, pas de migration de schéma pour la partie accès.
