# Demande d'information complémentaire — Checkout hybride CEO Summit × Evolia

> **Date :** 2 septembre 2026
> **De :** Équipe technique CEO Summit
> **À :** Équipe technique Evolia
> **Objet :** Complément à notre demande du 12 août 2026 (`04_demande_information_evolia.md`) — le parcours a évolué suite à nos échanges, ce document précise ce qui change et ce dont nous avons encore besoin
> **Document interne associé :** [`07_parcours_valide_evolia_checkout_hybride.md`](./07_parcours_valide_evolia_checkout_hybride.md)

---

## Ce qui change par rapport à notre demande du 12 août

Notre demande initiale (`04`) partait du principe qu'Evolia hébergerait l'intégralité du formulaire d'achat (identité, entreprise, offre) avant de nous notifier. Suite à nos échanges, le parcours retenu est différent :

- **CEO Summit garde la main sur la page d'offres, l'inscription du gestionnaire et la gestion de l'entreprise/des collaborateurs.** Evolia n'intervient que sur la **transaction de paiement** elle-même, une fois toutes ces informations déjà connues de notre côté.
- **Deux nouveaux besoins techniques** apparaissent donc, absents de notre demande initiale :
  1. Un moyen d'**initier un paiement depuis notre plateforme** vers Evolia (plutôt qu'une redirection vers un formulaire Evolia autonome), avec les informations de contexte (entreprise, offre, montant, référence) déjà connues côté CEO Summit.
  2. Un **webhook que nous vous enverrons**, à chaque nouveau participant ajouté par une entreprise déjà active sur notre plateforme (pas seulement au moment du paiement initial).
- **Le webhook de confirmation de paiement (`04` §2.2/§3) reste nécessaire**, mais son contexte change : il ne sert plus à créer un compte à partir de rien, il confirme un paiement pour un gestionnaire/une entreprise **déjà enregistrés chez nous**. Le payload proposé en `04` reste une bonne base mais nécessite d'être ajusté (voir §3 ci-dessous).
- Deux modes de paiement (**virement bancaire**, **preuve de paiement uploadée**) restent gérés entièrement en interne par un administrateur CEO Summit, en parallèle du paiement via Evolia — sans impact sur votre intégration, sauf réponse à la question posée en §4.

---

## 1. Initiation du paiement depuis CEO Summit

- Quel mécanisme proposez-vous pour qu'un paiement soit initié **depuis notre plateforme**, une fois l'offre, l'entreprise et le gestionnaire déjà identifiés chez nous ? (ex. appel API qui retourne une URL de paiement à ouvrir/rediriger, formulaire embarqué, widget JS, ou autre.)
- Quelles informations pouvons-nous vous transmettre à l'initiation pour éviter toute ressaisie côté utilisateur (montant, devise, référence interne, identifiant entreprise, email du gestionnaire) ?
- Une fois le paiement effectué, l'utilisateur est-il redirigé vers une `return_url`/`success_url` que nous fournissons ? Peut-on y recevoir une référence de paiement en paramètre ?
- Existe-t-il un environnement sandbox pour tester cette initiation avant mise en production ?

## 2. Webhook de confirmation de paiement (révision de `04` §2.2)

Les questions posées en `04` §2.2 restent valables (authentification, idempotence, politique de retry, événement dédié en cas d'échec/remboursement, sandbox). S'ajoute une précision de contexte : le paiement confirmé se rattache à une entreprise **déjà créée chez nous** au moment de l'initiation (§1) — le payload de confirmation n'a donc plus besoin de porter toutes les informations d'inscription (nom, prénom, organisation), seulement une **référence stable** permettant de retrouver la transaction initiée côté CEO Summit. Voir proposition de payload révisée en §3.

## 3. Proposition de payload révisée (webhook de confirmation)

```json
{
  "event": "payment.confirmed",
  "reference": "evolia-tx-abc123",
  "ceoSummitReference": "chk_9f2ab3",
  "payment": {
    "amount": 250000,
    "currency": "MGA",
    "date": "2026-09-02T10:32:00Z"
  }
}
```

- `ceoSummitReference` : identifiant que nous transmettrons à l'initiation du paiement (§1) — à nous retourner tel quel, sans réinterprétation, pour que nous puissions retrouver la transaction sans dépendre uniquement de `reference` (propriété Evolia).
- Les champs `registrant`/`organizationName`/`offerCode` de la proposition initiale (`04` §3) ne sont plus nécessaires dans ce sens — déjà connus de notre côté au moment de l'initiation.

## 4. Nouveau : webhook sortant (CEO Summit → Evolia)

À chaque évolution de la liste des participants d'une entreprise déjà active sur notre plateforme (nouveau collaborateur ajouté, y compris le gestionnaire initiateur dès la confirmation du paiement), nous souhaitons vous notifier automatiquement — ce mécanisme n'existait pas dans notre demande initiale.

**Ce que ce webhook doit porter, précisé de notre côté** : vous avez besoin de connaître l'ensemble des participants d'une entreprise pour générer leur QR code d'accès physique. En conséquence, l'**entreprise est l'entité racine** du payload, et chaque appel porte la **liste complète et à jour des participants de cette entreprise** — y compris celui qui a initié l'inscription (le gestionnaire n'est pas traité à part, c'est un participant comme les autres) — plutôt qu'un seul participant ajouté à la marge. Ça vous évite de reconstituer l'état complet à partir d'une suite d'événements incrémentaux, et ça nous simplifie l'implémentation (un seul type d'événement, toujours un instantané complet).

### Proposition de payload

```json
{
  "event": "company.participants.synced",
  "companyId": "cmp_8f21ab",
  "company": {
    "name": "Groupe Exemple SA",
    "sector": "Fintech"
  },
  "offer": {
    "name": "Executive corporate pass",
    "description": "Accès entreprise incluant 10 participants à l'édition CEO Summit 2026",
    "includedParticipants": 10,
    "priceAr": 2500000
  },
  "participants": [
    {
      "firstName": "Fanja",
      "lastName": "Rakoto",
      "email": "fanja@exemple.mg",
      "isInitiator": true
    },
    {
      "firstName": "Hery",
      "lastName": "Andria",
      "email": "hery@exemple.mg",
      "isInitiator": false
    }
  ]
}
```

- `offer.includedParticipants`/`offer.priceAr` : quota et prix de l'offre souscrite, pour que vous puissiez rapprocher le nombre de participants effectivement envoyés du nombre inclus (et facturer/valider un éventuel dépassement si votre offre le permet).
- `isInitiator` : signale le gestionnaire/responsable du compte entreprise, sans le sortir de la liste — utile si votre génération de badge/QR doit le distinguer visuellement (ex. badge "organisateur"), sans changer la structure.

### Questions

- Quel format/endpoint souhaitez-vous recevoir côté Evolia pour ce webhook (URL à appeler, méthode, authentification attendue de notre part) ?
- Un instantané complet à chaque appel vous convient-il, ou préférez-vous un modèle incrémental (delta) de votre côté ? Si delta, comment voulez-vous gérer une désynchronisation (ex. notre webhook a échoué une fois, votre liste est en retard) ?
- Confirmez-vous qu'un identifiant stable par entreprise (le vôtre ou le nôtre, à convenir — `companyId` proposé ci-dessus) suffit à rattacher l'envoi à la bonne entreprise ?
- **Précision tranchée de notre côté** : ce webhook nous concerne pour **toute** entreprise dont la liste de participants change, y compris quand le paiement a été validé manuellement en interne (virement bancaire, preuve de paiement) — pas seulement les entreprises dont le paiement est passé par votre plateforme. Ce n'est donc pas un événement de paiement à proprement parler de notre côté, mais un événement "liste de participants à jour" — pouvez-vous le recevoir sous cette forme sans que ça perturbe votre réconciliation des transactions que vous avez traitées vous-mêmes ?

## 5. Prochaines étapes

1. Votre retour sur la faisabilité des points 1 et 4 (initiation de paiement, webhook sortant).
2. Confirmation ou ajustement du payload révisé en §3.
3. Accès sandbox pour tester les deux sens (initiation + webhooks entrant/sortant) avant mise en production.

Les points de `04` non mentionnés ici (authentification, idempotence, retry, sandbox du webhook entrant) restent d'actualité — merci de nous confirmer qu'ils tiennent toujours dans ce modèle révisé.
