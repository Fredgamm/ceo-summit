# Demande d'information technique — Intégration paiement/inscription CEO Summit × Evolia

> **Date :** 12 août 2026
> **De :** Équipe technique CEO Summit
> **À :** Équipe technique Evolia
> **Objet :** Spécification nécessaire pour intégrer Evolia comme point d'entrée du parcours d'achat (inscription + paiement) de la plateforme CEO Summit

---

## Contexte

CEO Summit est une plateforme B2B (chaque inscrit est rattaché à une entreprise). Nous souhaitons qu'Evolia héberge le formulaire d'achat d'une offre (inscription + paiement) et nous notifie automatiquement une fois le paiement confirmé, afin que nous puissions créer le compte correspondant sur notre plateforme.

Avant de développer cette intégration, nous avons besoin d'une spécification précise de ce qu'Evolia peut fournir. Ce document liste nos besoins et propose un format d'échange à valider ensemble.

---

## 1. Parcours cible

1. Le visiteur consulte le site vitrine public CEO Summit et voit le détail d'une offre.
2. Il clique sur l'offre → il est redirigé vers **Evolia**.
3. **Sur Evolia**, il renseigne : nom, prénom, email, nom de l'organisation, et confirme l'offre choisie.
4. Il procède au paiement sur Evolia.
5. **Une fois le paiement confirmé**, Evolia notifie la plateforme CEO Summit via API (webhook) avec les informations ci-dessus + la confirmation de paiement.
6. La plateforme CEO Summit crée le compte utilisateur à partir de ces données, puis envoie un email à l'utilisateur avec un lien d'activation + mot de passe provisoire.
7. L'utilisateur se connecte et complète son profil — Evolia n'intervient plus après la notification initiale.

---

## 2. Ce dont nous avons besoin

### 2.1 Formulaire d'achat (côté Evolia)

- Confirmation qu'Evolia peut collecter, sur son propre formulaire d'achat, les champs suivants avant paiement :
  - Nom, prénom
  - Email
  - Nom de l'organisation (texte libre)
  - Offre choisie (à partir d'un catalogue — voir 2.4)
- Evolia impose-t-il des champs additionnels obligatoires de son côté (téléphone, adresse de facturation, etc.) ? Si oui, lesquels ?
- Peut-on pré-remplir certains de ces champs au moment de la redirection depuis notre site (paramètres d'URL, session token, ou autre mécanisme), pour éviter à l'utilisateur de ressaisir une information déjà connue ?

### 2.2 Webhook de notification (Evolia → CEO Summit)

- URL, méthode HTTP, et format attendus pour l'endpoint que nous exposerons (nous proposons `POST /api/webhooks/evolia`, JSON).
- **Schéma exact du payload envoyé lors d'un paiement confirmé** — nous proposons la structure en section 3 comme point de départ.
- Mécanisme d'authentification du webhook : signature HMAC (header dédié, algorithme, secret partagé — comment est-il généré/renouvelé ?), IP source fixe à whitelister, ou autre méthode ?
- **Idempotence** : en cas de retry, Evolia renvoie-t-il le même identifiant d'événement/paiement ? Nous avons besoin d'une clé stable pour éviter tout doublon si la même notification arrive deux fois.
- Politique de retry : combien de tentatives, sur quel intervalle, et que se passe-t-il si toutes échouent ?
- Existe-t-il un événement séparé pour un paiement **échoué** ou **remboursé**, avec un payload dédié ?
- Existe-t-il un accès à un **environnement sandbox** pour tester ce webhook avant mise en production, avec des paiements fictifs ?

### 2.3 Retour utilisateur après paiement

- Une fois le paiement effectué sur Evolia, l'utilisateur est-il redirigé automatiquement vers une URL de retour que nous fournissons (`return_url` / `success_url`) ? Si oui, peut-on y recevoir une référence de paiement en paramètre ?
- Que voit l'utilisateur si notre webhook échoue à réceptionner la notification alors que le paiement, lui, a bien été accepté par Evolia ? Existe-t-il un mécanisme qu'on peut consulter/relancer manuellement de notre côté ?

### 2.4 Catalogue d'offres

- Comment Evolia identifie-t-il l'offre choisie dans le payload envoyé à la plateforme — un **code/identifiant stable** que nous définissons et vous communiquons (proposé en section 3), ou un intitulé libre, ou uniquement un montant ?
- Si notre catalogue d'offres change (nouvelle offre, offre retirée, changement de nom), quel est le processus pour le répercuter chez vous — accès à un back-office, ou échange manuel par ticket/email ?

---

## 3. Proposition de payload

```json
{
  "event": "payment.confirmed",
  "reference": "evolia-tx-abc123",
  "offerCode": "executive",
  "registrant": {
    "firstName": "Fanja",
    "lastName": "Rakoto",
    "email": "fanja@exemple.mg",
    "organizationName": "Groupe Exemple SA"
  },
  "payment": {
    "amount": 250000,
    "currency": "MGA",
    "date": "2026-08-12T10:32:00Z"
  }
}
```

Points à valider explicitement avec vous :

- `offerCode` : identifiant stable que nous définissons — pouvez-vous le transmettre tel quel, sans le réinterpréter ?
- `reference` : doit être unique et stable par transaction, réutilisable pour un éventuel retry sans dupliquer l'inscription côté plateforme.
- Champs manquants ou en trop à ajuster une fois votre capacité réelle connue (ex. téléphone si vous le collectez systématiquement).

---

## 4. Prochaines étapes

- Un retour de votre part sur les points ci-dessus (faisabilité, écarts par rapport à la proposition de payload).
- Un accès à votre environnement sandbox pour des tests d'intégration avant mise en production.

N'hésitez pas à nous solliciter pour toute précision.
