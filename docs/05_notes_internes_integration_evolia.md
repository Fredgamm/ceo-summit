# Module 05 — Notes internes : intégration Evolia (paiement/inscription)

> **Statut :** Notes internes — usage CEO Summit uniquement, ne pas transmettre à Evolia
> **Version :** 1.0
> **Date :** 12 août 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Document lié :** [`04_demande_information_evolia.md`](./04_demande_information_evolia.md) — la version à envoyer à Evolia, volontairement dépourvue du contexte et des décisions ci-dessous.

---

## 1. Contexte et historique

Décision produit du 12 août 2026 (session de concertation) : le parcours d'inscription/paiement bascule d'un modèle self-service (formulaire + preuve + validation admin manuelle, actuellement en production) vers un modèle où **Evolia devient le point d'entrée du parcours d'achat**, avec notification automatique à la plateforme après paiement confirmé.
---

## 2. Décisions internes

- **Le quota de collaborateurs invitables est la seule règle de gestion qui reste différenciée par offre.** Tout le reste de l'ancien moteur d'offres (pricing par participant, seuil minimum de participants avant paiement, pool de crédits différencié, changement d'offre avant paiement) disparaît avec ce nouveau modèle — il n'y a plus de paiement ni de validation à gérer côté plateforme, Evolia s'en charge entièrement en amont.
- **Le quota est figé sur l'entreprise au moment de la réception du webhook.** Une modification ultérieure du quota associé à un `offerCode` (faite par un admin CEO Summit) ne s'applique qu'aux nouvelles inscriptions, jamais rétroactivement aux entreprises déjà enregistrées.

## 3. Questions encore ouvertes (à trancher avant/pendant l'échange avec Evolia)

- Confirmer avec le client que l'absence de toute RG différenciée par offre (au-delà du quota de collaborateurs) est bien voulue, et pas seulement une simplification de notre part supposée acceptable.
- Le mapping `offerCode → quota` : où et par qui est-il configuré côté admin CEO Summit ? (à spécifier au moment du développement sur `mvp-connect-simple`, pas dans la demande à Evolia).
- Que faire si Evolia ne peut pas garantir l'idempotence ou la stabilité de `offerCode` (voir §2.2 et §2.4 du document envoyé) — prévoir un plan B (ex. dédoublonnage par email côté plateforme, quota par défaut si code inconnu) avant de considérer l'intégration prête pour la prod.

## 4. Prochaines étapes

1. Validation interne du contenu de `04_demande_information_evolia.md` avant envoi.
2. Envoi à Evolia — délai de réponse à cadrer (le cadrage d'origine prévoyait J+5 ouvrés, `RG-P0-04` ; à réévaluer selon l'urgence actuelle, étant donné le précédent).
3. Une fois les réponses reçues : ajuster `lib/validations/webhooks.ts` (schéma `evoliaWebhookSchema`, aujourd'hui obsolète/jamais branché) en conséquence.
4. Développement de l'intégration sur la branche `mvp-connect-simple` (pas sur `main`, qui reste la référence complète — voir décision de branche du 12 août 2026).
5. Accès sandbox Evolia obtenu → tests d'intégration réels avant bascule en production.
