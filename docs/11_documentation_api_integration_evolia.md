# Module 11 — Documentation d'intégration API — CEO Summit × Evolia

> **Statut :** Documentation technique finale — publiée aussi en page web accessible directement à Evolia (voir note ci-dessous), remplace les échanges précédents (`04`, `08`) par une référence unique et à jour
> **Version :** 1.6 — révisée le 8 octobre 2026 (intégration construite : endpoint et lien de paiement Evolia, signature `X-Webhook-Signature`, dates de l'événement `eventDetails`, liste des participants validée par le gestionnaire) — v1.5 du 25 septembre 2026 (audit MVP : état réel de l'échange 2, codes HTTP `400`/`429`, valeurs réelles de `paymentMethod`, montants en Ariary uniquement, en-tête anti-rejeu optionnel `X-Webhook-Timestamp`) — v1.4 du 22 septembre 2026 : résumé de flux, `includedParticipants`, « Je participe », supplément construit, note sécurité HTTPS/HMAC
> **Date :** 3 septembre 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Contexte :** suite à `10_reponse_acces_code_evolia.md` — pas d'accès au code fourni ; cette documentation est le contrat d'intégration complet, suffisant pour l'implémenter sans lui.
> **Page publique :** `https://app.ceo-summit.mg/integration-evolia` — même contenu, à envoyer directement à l'équipe technique Evolia plutôt que ce fichier ou l'export HTML précédent, qui restent la source de rédaction mais ne sont plus la version à jour à partager.

---

## 1. Vue d'ensemble

**Le principe : c'est CEO Summit qui vous envoie les données, vous n'avez rien à interroger ni à récupérer chez nous.** Deux appels **HTTPS** (jamais de HTTP en clair — voir note sécurité ci-dessous), chacun dans un sens, plus une redirection du gestionnaire vers votre page de paiement pour la carte et le Mobile Money (§3) :

1. Un utilisateur choisit une offre payante sur CEO Summit → **CEO Summit vous pousse l'inscription** (`POST` signé HMAC-SHA256 vers votre endpoint, voir §3).
2. Vous encaissez ce paiement de votre côté, par le moyen de votre choix.
3. Une fois encaissé, **vous confirmez auprès de CEO Summit** en appelant notre webhook, déjà en ligne : sa vérification de signature est testable dès aujourd'hui, indépendamment de l'avancement du point 1 (voir §2).

| #   | Sens                | Objet                                                  | Statut                                                                                                                                                                                               |
| --- | ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CEO Summit → Evolia | Push d'inscription (entreprise + offre + participants) | ✅ Construit — endpoint et secret reçus le 8 octobre 2026 (§3)                                                                                                                                       |
| 2   | Evolia → CEO Summit | Confirmation de paiement                               | 🟡 **Route en ligne**, signature vérifiée — reliée aux paiements carte / Mobile Money lancés par l'échange 1 (voir §2) ; **uniquement pour les paiements traités par Evolia** (voir note ci-dessous) |

Aucun de ces deux échanges ne nécessite un accès au code de la plateforme — chacun est un appel HTTPS avec un contrat de données précis, décrit ci-dessous.

> **Note — sécurité du transport.** Les deux échanges se font exclusivement en **HTTPS (TLS)**, jamais en HTTP en clair — non négociable des deux côtés, données d'entreprises et de participants en jeu. En plus du chiffrement du transport, l'échange 2 (notre webhook, §2) exige une **signature HMAC-SHA256** sur chaque requête pour garantir que l'appel vient bien de vous, pas seulement qu'il transite en HTTPS — voir le détail en §2. Réciproquement, chaque appel de l'échange 1 (§3) est signé en HMAC-SHA256 avec le secret que vous nous avez fourni (`WEBHOOK_SECRET`) — voir §3, « Endpoint et authentification ».

> **Note — le virement bancaire ne passe pas par Evolia.** CEO Summit propose deux moyens de paiement en parallèle : le paiement via Evolia (échanges 1 et 2 ci-dessous), et le virement bancaire, dont la preuve est validée directement et manuellement par un administrateur CEO Summit — sans appel à Evolia, ni entrant ni sortant. **Seule exception : le push d'inscription (§3) s'envoie dans les deux cas**, puisqu'Evolia a besoin de connaître tout participant qui obtient l'accès, quel que soit son mode de paiement.

---

## 2. Échange 2 — Webhook de confirmation de paiement (Evolia → CEO Summit)

**La route est en ligne côté CEO Summit** (route générique, conçue pour n'importe quel prestataire de paiement externe — Evolia y compris) : elle vérifie la signature, valide le corps de la requête et confirme le paiement référencé, avec les mêmes effets qu'une validation manuelle par un administrateur.

**Références réelles :** chaque paiement carte / Mobile Money lancé sur CEO Summit crée la `reference` (`ceoSummitReference` du push, §3) que ce webhook attend. Pour tester votre calcul de signature : un appel correctement signé portant une référence inconnue renvoie `409` (et non `401`).

Ce webhook ne concerne que les paiements initiés et traités par Evolia (§3). Un paiement par virement bancaire suit un chemin entièrement séparé, validé manuellement par un administrateur CEO Summit — Evolia n'a rien à appeler dans ce cas.

### Requête attendue

```
POST https://app.ceo-summit.mg/api/webhooks/payments
Content-Type: application/json
X-Webhook-Signature: sha256=<signature hex>
X-Webhook-Timestamp: <secondes Unix>   (optionnel — voir « Anti-rejeu » ci-dessous)
```

### Corps de la requête

```json
{
  "event": "payment.confirmed",
  "type": "company_payment",
  "reference": "cmp_9f2ab3d8e1",
  "amount": 2500000
}
```

| Champ       | Type                                        | Requis | Description                                                                                                                                                                    |
| ----------- | ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event`     | `"payment.confirmed"` \| `"payment.failed"` | oui    | Résultat du paiement.                                                                                                                                                          |
| `type`      | `"company_payment"`                         | oui    | Toujours cette valeur pour un paiement d'offre entreprise (l'autre valeur possible, `event_registration`, ne concerne pas l'intégration Evolia).                               |
| `reference` | string                                      | oui    | **L'identifiant que CEO Summit vous aura transmis dans le push d'inscription** (voir §3, champ `ceoSummitReference`) — à renvoyer strictement tel quel, sans le réinterpréter. |
| `amount`    | number                                      | non    | Montant confirmé, en Ariary. Informatif — CEO Summit ne recalcule rien à partir de ce champ.                                                                                   |

### Authentification — HMAC-SHA256

- Secret partagé, à échanger hors bande (jamais dans le payload ni dans l'URL) — variable d'environnement `PAYMENT_WEBHOOK_SECRET` côté CEO Summit.
- Signature calculée sur le **corps brut** de la requête (la chaîne JSON exacte envoyée, pas une reconstruction) : `HMAC-SHA256(corps_brut, secret)`, encodée en hexadécimal.
- Transmise dans l'en-tête `X-Webhook-Signature`, avec ou sans préfixe `sha256=` (les deux formes sont acceptées).
- Toute requête sans signature valide est rejetée en `401`, avant tout traitement, et journalisée.

### Anti-rejeu — en-tête optionnel `X-Webhook-Timestamp`

Recommandé, mais facultatif et rétro-compatible (ajouté le 25 septembre 2026) :

- **Sans cet en-tête** : comportement décrit ci-dessus, inchangé — signature sur le corps brut seul.
- **Avec cet en-tête** (`X-Webhook-Timestamp: 1790000000`, horodatage en **secondes Unix**, UTC) : la signature porte alors sur la chaîne `<timestamp>.<corps_brut>` (le timestamp, un point, puis le corps brut exact) — `HMAC-SHA256("<timestamp>.<corps_brut>", secret)`, toujours en hexadécimal dans `X-Webhook-Signature`. Une requête dont l'horodatage s'écarte de plus de **5 minutes** de l'heure du serveur CEO Summit est rejetée en `401` : une confirmation interceptée ne peut donc pas être rejouée plus tard.

### Réponses

| Code  | Signification                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `200` | Paiement traité — `{"data":{"received":true}}`                                                                                                               |
| `400` | Corps de requête qui n'est pas du JSON valide                                                                                                                |
| `401` | Signature invalide ou absente (ou `X-Webhook-Timestamp` invalide / de plus de 5 minutes)                                                                     |
| `409` | `reference` introuvable, ou paiement déjà confirmé/traité (idempotence : un retry sur un paiement déjà traité renvoie ce code, pas une seconde confirmation) |
| `422` | JSON valide mais contenu invalide (champ manquant/mal typé)                                                                                                  |
| `429` | Trop de requêtes — limite de **60 requêtes par minute et par adresse IP** ; réessayer après une courte attente                                               |
| `500` | Erreur interne CEO Summit                                                                                                                                    |

### Idempotence et retries

Un même `reference` ne peut être confirmé qu'une seule fois (vérifié en base, verrouillé contre les doublons). Un retry sur un paiement déjà confirmé renvoie `409`, sans effet de bord — Evolia peut réessayer sans risque en cas de doute sur la réception d'un `200`.

### Environnement de test

Pas de sandbox dédiée à ce stade — l'environnement de dev CEO Summit peut recevoir des appels de test une fois une URL d'accès convenue avec l'équipe Evolia (à coordonner séparément, hors de ce document).

---

## 3. Échange 1 — Push d'inscription (CEO Summit → Evolia)

CEO Summit inscrit l'entreprise qui a choisi une offre sur sa propre interface, puis pousse ces informations vers Evolia en un seul appel. Pour un paiement par **carte bancaire ou Mobile Money**, le gestionnaire est ensuite **redirigé vers votre page de paiement** :

```
https://event.aiolia.us/ceosummit/payment/{ceoSummitReference}
```

Evolia encaisse le paiement et confirme via le webhook de l'échange 2 (§2) une fois le paiement reçu. Tant que cette confirmation n'est pas arrivée, l'espace CEO Summit du gestionnaire lui propose un lien « Reprendre le paiement » vers la même page (paiement interrompu, onglet fermé…) : la page doit donc rester utilisable pour une même `ceoSummitReference` tant qu'elle n'a pas été payée.

**Retour vers CEO Summit après paiement :** une fois le paiement finalisé sur votre page, redirigez le gestionnaire vers :

```
https://app.ceo-summit.mg/entreprise/paiement/confirmation?ref={ceoSummitReference}
```

Cette page attend que votre confirmation (§2) soit enregistrée, quelques secondes au plus, puis ouvre l'espace du gestionnaire sur la désignation des participants à l'événement. Elle fonctionne même si la redirection précède votre webhook. Cette redirection ne remplace pas le webhook : c'est lui seul qui active l'accès.

### Endpoint et authentification

- **URL :** `POST https://api-event.aiolia.us/integration/ceosummit/registrations`
- **Corps :** JSON (`Content-Type: application/json`), un des payloads ci-dessous.
- **Signature :** en-tête `X-Webhook-Signature: sha256=<hex>`, où `<hex>` est le HMAC-SHA256 du **corps brut** de la requête avec votre `WEBHOOK_SECRET` — même schéma que notre propre webhook (§2). Comparez en temps constant.
- **Réponse attendue :** tout code `2xx` vaut réception. Tout autre code (ou absence de réponse sous 10 secondes) est journalisé en échec côté CEO Summit et peut être renvoyé à l'identique par un administrateur ; un même payload peut donc vous parvenir plus d'une fois.
- **Paiement carte / Mobile Money :** si l'appel échoue, CEO Summit ne redirige pas le gestionnaire (rien ne pourrait être encaissé) : le paiement est annulé de notre côté et il lui est proposé de réessayer ou de régler par virement.

### Déclencheurs

Cet appel est envoyé à trois moments distincts, avec le même format :

1. **Inscription initiale** — l'entreprise vient d'être créée avec un seul participant, le gestionnaire, qui a choisi une offre à payer via Evolia. C'est ce push qui déclenche la collecte du paiement côté Evolia — envoyé **avant** toute confirmation de paiement, pas après. **Important : le gestionnaire n'est pas automatiquement un participant à l'événement** — c'est souvent juste la personne qui inscrit l'entreprise et paie (ex. une secrétaire), pas forcément quelqu'un qui assistera à l'évènement. **Evolia ne doit rien générer (badge, QR) à partir de ce seul push** — voir le point d'attention ci-dessous.
2. **Validation de la liste des participants** — plus tard, **parfois plusieurs jours après le paiement**, à sa prochaine connexion, le gestionnaire coche depuis son espace, parmi les comptes de son entreprise, les personnes qui assisteront à l'évènement (lui-même compris s'il y assiste), dans la limite des places de son offre, puis valide la liste. **C'est ce déclencheur, pas le premier, qui doit faire foi pour générer les accès et badges/QR** — chaque validation envoie un nouvel appel avec la liste à jour.
3. **Ajout de participants au-delà du quota inclus** — si l'offre payée inclut un nombre limité de participants (ex. 2) et que le gestionnaire veut en ajouter davantage, la plateforme lui propose un supplément payant par personne supplémentaire (montant à valider, ex. 900 €/participant × le nombre ajouté). Une fois ce paiement additionnel validé (via Evolia ou virement, même mécanisme que le paiement initial), un `company.participants.confirmed` repart avec la capacité totale mise à jour si la liste avait déjà été validée, puis à chaque nouvelle validation de la liste par le gestionnaire.

**Ce push s'envoie aussi pour une entreprise qui règle par virement bancaire** (voir note §1) — dans ce cas il part au moment de la validation manuelle du virement par l'admin CEO Summit, pas avant, puisqu'il n'y a alors rien à faire encaisser à Evolia ; il ne sert plus qu'à leur faire connaître le participant.

### Proposition de payload

Même structure aux trois déclencheurs, mais **deux valeurs distinctes du champ `event`** — c'est ce champ, pas la présence d'un nom, qui indique à Evolia si la liste est prête pour la génération de badges :

| Valeur de `event`                | Sens                                                                                                                                                            | Badge/QR à générer ?                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `company.registration.pushed`    | Inscription (et paiement, initial ou supplément) en cours — `participants` n'est **pas encore** la liste confirmée des personnes qui assisteront à l'évènement. | **Non.**                                                  |
| `company.participants.confirmed` | Le gestionnaire a validé la liste réelle des participants depuis son espace.                                                                                    | **Oui** — c'est le seul déclencheur à considérer pour ça. |

**1. Inscription initiale** (déclencheur 1) — le gestionnaire qui paie, pas encore un participant confirmé :

```json
{
  "event": "company.registration.pushed",
  "companyId": "cmp_8f21ab",
  "ceoSummitReference": "cmp_9f2ab3d8e1",
  "paymentMethod": "evolia",
  "amountDue": 2500000,
  "currency": "MGA",
  "company": {
    "name": "Groupe Exemple SA",
    "sector": "Fintech",
    "country": "Madagascar"
  },
  "offer": {
    "name": "Executive corporate pass",
    "description": "Accès entreprise incluant 10 participants à l'édition CEO Summit 2026",
    "includedParticipants": 10
  },
  "eventDetails": {
    "id": "evt_ceo2026",
    "title": "CEO Summit 2026",
    "startsAt": "2026-11-15T08:30:00+03:00",
    "endsAt": "2026-11-15T18:00:00+03:00",
    "timezone": "Indian/Antananarivo",
    "location": "Carlton Anosy, Antananarivo"
  },
  "participants": [{ "fullName": "Fanja Rakoto", "email": "fanja@exemple.mg", "isInitiator": true }]
}
```

**2. Quelques jours plus tard, validation de la liste des participants** (déclencheur 2) — le gestionnaire choisit qui assiste réellement (ici, lui-même et un collaborateur) :

```json
{
  "event": "company.participants.confirmed",
  "companyId": "cmp_8f21ab",
  "ceoSummitReference": "cmp_9f2ab3d8e1",
  "company": {
    "name": "Groupe Exemple SA",
    "sector": "Fintech",
    "country": "Madagascar"
  },
  "offer": {
    "name": "Executive corporate pass",
    "description": "Accès entreprise incluant 10 participants à l'édition CEO Summit 2026",
    "includedParticipants": 10
  },
  "eventDetails": {
    "id": "evt_ceo2026",
    "title": "CEO Summit 2026",
    "startsAt": "2026-11-15T08:30:00+03:00",
    "endsAt": "2026-11-15T18:00:00+03:00",
    "timezone": "Indian/Antananarivo",
    "location": "Carlton Anosy, Antananarivo"
  },
  "participants": [
    { "fullName": "Fanja Rakoto", "email": "fanja@exemple.mg", "isInitiator": true },
    { "fullName": "Hery Andria", "email": "hery@exemple.mg", "isInitiator": false }
  ]
}
```

**3. Ajout de participants au-delà du quota inclus** (déclencheur 3) — l'offre n'incluait que 2 participants, le gestionnaire en ajoute un 3ᵉ : un `company.registration.pushed` part d'abord pour le supplément, puis un `company.participants.confirmed` suit dès que ce paiement est validé, avec la liste complète mise à jour. Le tarif du supplément n'est **pas** une valeur fixe codée en dur (l'exemple précédent mentionnait 900 €, à titre illustratif) — c'est le prix d'une offre configurée par l'admin CEO Summit comme n'importe quelle autre (ex. « Executive Pass » à l'unité, ou une offre Groupement par lot de places), donc `amountDue` reflète le prix réel de l'offre supplément choisie, multiplié par la quantité achetée — **toujours en Ariary** (ici ≈ 900 € convertis au taux du jour). `participants` y reprend la liste confirmée à cet instant ; la personne ajoutée y entrera quand le gestionnaire validera de nouveau sa liste, une fois la place payée :

```json
{
  "event": "company.registration.pushed",
  "companyId": "cmp_8f21ab",
  "ceoSummitReference": "cmp_9f2ab3d8e1",
  "paymentMethod": "evolia",
  "amountDue": 4365000,
  "currency": "MGA",
  "company": {
    "name": "Groupe Exemple SA",
    "sector": "Fintech",
    "country": "Madagascar"
  },
  "offer": {
    "name": "Supplément — 1 participant additionnel",
    "description": "Ajout d'un participant au-delà du quota inclus dans l'offre initiale",
    "includedParticipants": 1
  },
  "eventDetails": {
    "id": "evt_ceo2026",
    "title": "CEO Summit 2026",
    "startsAt": "2026-11-15T08:30:00+03:00",
    "endsAt": "2026-11-15T18:00:00+03:00",
    "timezone": "Indian/Antananarivo",
    "location": "Carlton Anosy, Antananarivo"
  },
  "participants": [
    { "fullName": "Fanja Rakoto", "email": "fanja@exemple.mg", "isInitiator": true },
    { "fullName": "Hery Andria", "email": "hery@exemple.mg", "isInitiator": false }
  ]
}
```

| Champ                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ceoSummitReference` | **À renvoyer strictement tel quel dans le webhook de confirmation** (§2, champ `reference`) — absent de ce champ, aucun lien possible entre le paiement encaissé et l'inscription.                                                                                                                                                                                                                                                                                       |
| `paymentMethod`      | `"evolia"` (carte bancaire ou Mobile Money, paiement à encaisser par vos soins) ou `"virement"` (virement ou chèque, déjà réglé et validé manuellement côté CEO Summit — push informatif seulement, rien à encaisser). Absent sur `company.participants.confirmed` — rien à encaisser à ce déclencheur, tout paiement le précède déjà.                                                                                                                                   |
| `eventDetails`       | Événement auquel l'offre donne accès : `startsAt` et `endsAt` (début et fin, date et heure) en ISO 8601 avec le décalage de Madagascar (`+03:00`), `timezone` toujours `"Indian/Antananarivo"`, `location` (`"En ligne"` pour un événement en ligne). `null` si l'offre ne donne accès à aucun événement.                                                                                                                                                                |
| `amountDue`          | Montant à encaisser pour **ce** push précisément (pas un cumulatif) — le montant de l'offre initiale au déclencheur 1, celui du seul supplément au déclencheur 3. **Toujours en Ariary** : CEO Summit ne stocke les montants dus qu'en Ariary (une offre affichée en euros est convertie au taux du jour lors de sa configuration), d'où `currency` toujours égal à `"MGA"`. Absent sur `company.participants.confirmed` et sur `paymentMethod` `"VIREMENT"`/`"CHEQUE"`. |

Chaque appel transmet un **instantané complet** de l'entreprise à cet instant (pas un delta) — l'entreprise en entité racine, la liste intégrale et à jour de ses participants confirmés (gestionnaire inclus seulement s'il s'est lui-même ajouté, marqué `isInitiator`).

**Règles communes aux deux `event`, alignées sur vos contrôles (8 octobre 2026) :**

- `ceoSummitReference` est présent sur chaque appel. Sur `company.participants.confirmed`, c'est la référence du paiement de l'offre, déjà transmise avec l'inscription.
- `participants` n'est jamais vide. Pour un supplément acheté avant la validation de la liste, il contient le gestionnaire.
- Une liste de participants n'est envoyée qu'une fois l'abonnement actif, donc après l'encaissement.
- Offre sans paiement (partenaire institutionnel intégré par CEO Summit) : avant sa première liste, un `company.registration.pushed` part avec `paymentMethod: "virement"`, sans montant, et pour référence l'identifiant de son abonnement.

> **Point d'attention — ne pas générer de badge à partir d'un `company.registration.pushed`.** Le gestionnaire qui inscrit l'entreprise et paie n'est pas forcément quelqu'un qui assistera à l'évènement (souvent une secrétaire ou un assistant). Générez badges/QR uniquement à réception d'un `company.participants.confirmed` — jamais à partir du seul push d'inscription/paiement, même s'il contient déjà un nom.

> **Point d'attention — la liste de participants se remplit dans le temps.** `includedParticipants` (nombre de sièges de l'offre) ne veut pas dire que `participants` en contient déjà autant à l'inscription initiale. Le gestionnaire compose sa liste réelle à son rythme, parfois plusieurs jours après le paiement — le premier appel ne contient donc que lui (exemple 1), la liste confirmée arrive séparément (exemple 2), et peut encore grandir plus tard moyennant un paiement complémentaire si elle dépasse le quota inclus (exemple 3). Ce n'est pas une anomalie à signaler de votre côté.

> **Point d'attention — nom en un seul champ.** Côté CEO Summit, l'identité d'un utilisateur (gestionnaire ou collaborateur) est stockée comme un nom complet unique (`fullName`), jamais séparé en prénom/nom. Si votre encaissement ou vos badges nécessitent prénom et nom distincts, merci de le signaler : soit vous découpez `fullName` de votre côté (au premier espace, par exemple), soit CEO Summit doit ajouter deux champs séparés à son formulaire d'inscription/d'ajout de collaborateur — un changement de schéma à anticiper avant l'intégration finale, pas un simple ajustement de payload.

> **Point d'attention — `includedParticipants` ne veut pas dire la même chose selon le déclencheur.** Sur `company.registration.pushed` (déclencheurs 1 et 3), c'est le nombre de places **de la transaction en cours** — 10 pour l'offre principale, 1 pour un supplément d'une seule place (exemple 3) : ce nombre ne s'additionne pas d'un push à l'autre, chaque `company.registration.pushed` ne décrit que ce qu'il y a à encaisser à cet instant. Sur `company.participants.confirmed`, en revanche, c'est **la capacité totale actuelle de l'abonnement** — l'offre initiale plus tout supplément déjà validé — recalculée à chaque appel plutôt que reprise de l'offre d'origine ; c'est ce nombre-là qui fait foi pour savoir combien de places l'entreprise a le droit d'occuper au total. N'additionnez pas vous-même les `includedParticipants` de plusieurs `company.registration.pushed` pour reconstituer un total : le prochain `company.participants.confirmed` vous le donnera déjà calculé.

> **Point d'attention — qui apparaît dans `participants` sur `company.participants.confirmed`.** Le gestionnaire qui a inscrit l'entreprise (`isInitiator: true` dans nos exemples) n'apparaît dans cette liste **que s'il s'est lui-même coché comme participant** en validant la liste depuis son espace CEO Summit — sinon il reste un compte administratif pur, jamais un participant, même après validation de la liste par ses soins. C'est un choix explicite qu'il fait indépendamment de qui il ajoute par ailleurs : un gestionnaire peut inviter 5 collaborateurs sans jamais se déclarer participant lui-même, auquel cas `participants` n'en contiendra que 5, sans `isInitiator: true`. Tous les participants (gestionnaire inclus s'il y figure, et tout collaborateur ajouté depuis l'espace « Gestion » de l'entreprise) sont poussés **sous le même `companyId`/nom d'entreprise** à chaque appel, quel que soit le moment où ils ont été ajoutés — l'instantané complet (voir plus haut) garantit qu'aucun d'eux ne se retrouve rattaché à la mauvaise entreprise ou omis d'un envoi à l'autre.

### Ce dont nous avons besoin de votre part

1. ~~URL et méthode de votre endpoint, et authentification attendue de notre part~~ — reçus le 8 octobre 2026 (voir « Endpoint et authentification »).
   - **Reste à confirmer :** vos confirmations de paiement (§2) sont-elles signées avec le même `WEBHOOK_SECRET`, ou avec un secret distinct ?
2. **Confirmation du champ de référence** : que `ceoSummitReference` soit bien porté tel quel jusqu'à votre webhook de confirmation (§2, champ `reference`).
3. **Cas d'échec/annulation** : un événement `payment.failed` séparé sur votre confirmation (déjà supporté par notre webhook, voir §2) ou un comportement différent ?
4. Confirmation qu'un instantané complet à chaque appel convient (plutôt qu'un modèle incrémental).
5. Confirmation que `companyId` suffit à rattacher l'envoi à la bonne entreprise de votre côté.
6. Confirmation sur le point d'attention ci-dessus : `fullName` unique, ou prénom/nom séparés requis de votre côté ?
7. **Confirmation sur la distinction des deux `event`** : que la génération de badge/QR n'a bien lieu que sur `company.participants.confirmed`, jamais sur `company.registration.pushed`.
8. **Accès à un environnement sandbox** pour tester cet échange avant mise en production.

---

## 4. Annexe — état d'avancement interne (informatif, pas à transmettre tel quel)

- Échange 2 (confirmation) : route en ligne, testée unitairement, jamais encore exercée avec un vrai appel Evolia. Reste à construire avant tout appel réel : la création d'un `CompanyPayment` « à encaisser par Evolia » (la `reference`) — voir le point du 9 septembre ci-dessous. Anti-rejeu optionnel `X-Webhook-Timestamp` et documentation des codes `400`/`429` ajoutés le 25 septembre 2026 (audit MVP).
- Échange 1 (push d'inscription) : bloqué sur la réponse Evolia (§3) — rien à construire côté CEO Summit tant que l'URL/authentification cible n'est pas connue. À câbler sur **trois** points d'entrée internes une fois l'URL connue : la création d'une inscription à payer via Evolia (`paymentMethod` `CARTE_BANCAIRE`/`MOBILE_MONEY` — déclenche la collecte), la validation manuelle d'un virement par l'admin CEO Summit (`confirmCompanyPayment`, déjà construit — push informatif `paymentMethod: "VIREMENT"`), et l'acceptation d'une invitation collaborateur.
- Validé le 3 septembre 2026 avec CEO Summit : le virement bancaire est validé **directement par l'admin CEO Summit**, sans passer par Evolia (aucun appel, ni entrant ni sortant, côté paiement lui-même). Seul le push d'inscription (échange 1) reste commun aux deux chemins de paiement. Confirme la décision déjà actée dans `conception/07` §6.
- Simplifié le 9 septembre 2026 : plus de mécanisme de redirection/`return_url` — CEO Summit pousse l'inscription une fois, Evolia encaisse par le moyen de son choix et confirme via le webhook existant. Le point d'entrée qui crée l'enregistrement `CompanyPayment` avant confirmation (aujourd'hui créé seulement après upload d'une preuve manuelle) reste à construire ; nécessitera probablement un ajustement mineur de schéma (`CompanyPayment.proofFileKey` n'est aujourd'hui pas optionnel).
- Révisé le 16 septembre 2026 : distinction entre le gestionnaire qui paie et les participants réellement confirmés à l'évènement — génération de badge repoussée au déclencheur "validation de la liste des participants" (`company.participants.confirmed`), jamais à l'inscription/paiement seul (`company.registration.pushed`). **Aucun code à changer côté CEO Summit pour cette partie** — `app/actions/company-invites.ts` (acceptation d'une invitation collaborateur) est déjà le bon point d'entrée pour ce déclencheur.
- **Construit le 22 septembre 2026** : l'achat d'un supplément de participants (déclencheur 3). `Plan.isUpsell` marque une offre comme proposable en supplément (automatique pour toute offre Groupement `PER_PARTICIPANT`, cochable manuellement pour une offre à forfait comme Executive Pass) ; `purchaseUpsellSeats` (`app/actions/company-subscription.ts`) crée le paiement, et sa confirmation admin incrémente `CompanySubscription.extraSeats` sans jamais toucher au statut de l'abonnement (l'entreprise garde son accès pendant la revue). `lib/company-seats.ts::seatCap()` est la fonction unique qui calcule la capacité totale actuelle (offre de base + `extraSeats`) — c'est elle qu'il faudra rappeler pour calculer `includedParticipants` sur un `company.participants.confirmed` une fois le push construit. Le tarif n'est jamais codé en dur : c'est `Plan.priceAr` de l'offre supplément choisie, configurée par l'admin comme les autres offres.
- **Construit le 22 septembre 2026** : la case « Je participe » (`Company.adminParticipates`) — le gestionnaire qui inscrit l'entreprise et paie ne consomme une place, et n'apparaît dans la liste de participants poussée à Evolia, que s'il s'est lui-même déclaré participant. Filtre déjà appliqué au calcul du plafond de collaborateurs (`inviteTeammate`) ; à réutiliser telle quelle pour construire la liste `participants` du push une fois l'URL Evolia connue.
- **Construit le 8 octobre 2026** (`lib/evolia.ts`) : push signé vers l'endpoint Evolia, journalisé dans `EvoliaPush` (statut, code HTTP, erreur, tentatives) et relançable depuis `/admin/entreprises/[id]`. Déclencheurs : lancement d'un paiement carte / Mobile Money (`submitPaymentProof`, `purchaseUpsellSeats` → redirection vers la page de paiement Evolia ; push refusé = paiement annulé), confirmation d'un virement ou d'un chèque (`confirmCompanyPaymentCore`, push informatif), validation de la liste des participants par le gestionnaire (`validateEventParticipants`, module 18 §4.9 — remplace la case « Je participe » et l'inscription d'office à l'acceptation d'une invitation ou au paiement), confirmation d'un supplément si la liste était déjà validée. `Event.endDate` ajouté pour `eventDetails.endsAt` ; une offre se rattache à son événement depuis le formulaire d'offre admin. Variables : `EVOLIA_WEBHOOK_SECRET` (obligatoire), `EVOLIA_REGISTRATION_URL` et `EVOLIA_PAYMENT_URL` (facultatives). Pas de push pour un partenaire institutionnel intégré par l'admin (aucun paiement) tant qu'il ne valide pas de liste de participants.
- ~~**Toujours bloquant**~~ (historique, levé le 8 octobre 2026) : échange 1 (push d'inscription) reste entièrement à construire côté CEO Summit — rien de ce qui précède n'a encore d'appel sortant réel vers Evolia, faute d'URL/authentification cible (voir §3, point 1). Une fois cette réponse reçue, le code ci-dessus (adminParticipates, seatCap, purchaseUpsellSeats) fournit déjà toutes les données nécessaires pour construire les trois payloads — aucun changement de modèle de données à anticiper de ce côté-là.
