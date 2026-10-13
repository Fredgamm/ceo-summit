# Module 10 — Réponse à la demande d'accès au code d'Evolia

> **Statut :** Position tranchée — à communiquer à Evolia
> **Version :** 1.0
> **Date :** 3 septembre 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Document lié :** [`08_demande_complement_evolia_checkout_hybride.md`](./08_demande_complement_evolia_checkout_hybride.md) — le contrat d'intégration déjà envoyé, qui reste la base de cette réponse.

---

## 1. Ce qu'Evolia a demandé

Dans l'échange, Evolia a demandé un **accès au code** de la plateforme, pour "intégrer l'API" et construire le pont de paiement de leur côté.

## 2. Décision (3 septembre 2026)

**Refusé.** On ne donne pas accès au dépôt de code. À la place : on leur fournit une spécification précise de **l'input et l'output attendus du pont de paiement**, et la construction du pont elle-même leur revient entièrement — soit ils l'implémentent à partir de cette spécification, soit c'est à eux de nous fournir le pont (widget, SDK, redirection hébergée) que nous n'aurons plus qu'à appeler.

**Pourquoi** :

- Ce n'est pas la pratique normale pour une intégration de paiement : un prestataire a besoin de savoir quelle URL appeler, quel format envoyer/recevoir, quelle signature vérifier — pas de voir le code source de la plateforme qui l'appelle.
- Le dépôt Git est un historique complet, pas juste la branche MVP : un accès "à la branche" donnerait quand même accès à tout l'historique antérieur (schéma complet de la base, logique des autres modules — Deal Room, messagerie, modération, back-office — sans rapport avec le paiement).
- Risque de secrets : `.env` et autres identifiants ne sont pas censés être versionnés, mais un accès large au dépôt est une surface d'exposition inutile à ouvrir pour ce besoin précis.

## 3. Ce qu'on leur fournit à la place

La spécification déjà rédigée dans `08` couvre exactement les deux sens du pont :

1. **Input — ce que CEO Summit envoie pour initier un paiement** (`08` §1) : montant, devise, référence interne (`ceoSummitReference`), identifiant entreprise/gestionnaire. Encore ouvert : le mécanisme exact d'initiation (appel API retournant une URL à rediriger, widget embarqué, etc.) — c'est précisément la question posée à Evolia dans `08` §1, pas à nous de la deviner.
2. **Output — ce que CEO Summit reçoit en confirmation** (`08` §2-3) : webhook de confirmation avec le payload révisé (`ceoSummitReference`, montant, devise, date).
3. **Output supplémentaire — ce que CEO Summit envoie vers Evolia** (`08` §4) : le webhook sortant participants/entreprise, pour qu'ils génèrent leurs propres QR d'accès physique.

Rien de nouveau à rédiger : `08` répond déjà à "quel est l'input/output du pont" — la seule chose qui change ici, c'est le message explicite qu'**aucun accès au code n'accompagnera cette spécification**, et que la responsabilité de construire le pont (ou de nous en fournir un à appeler) leur appartient.

## 4. Prochaine étape

Renvoyer `08` à Evolia (s'il ne l'a pas déjà été) accompagné d'un message clair déclinant l'accès au code, dans l'esprit du §2 ci-dessus.
