# Module 19 — Cahier de recette QA du 7 octobre 2026

> **Statut :** codé en local le 7 octobre sur la branche `feat/qa-2026-10-07` (9 commits), non poussé. Type-check, lint et 865 tests verts ; vérifié dans Chrome et Edge.
> **Version :** 1.0
> **Date :** 7 octobre 2026
> **Source :** retours QA client, environnement Production (`app.ceo-summit.mg`)
> **Méthode :** même format que les modules `15` et `16`. Chaque point indique d'abord la demande, puis l'état du code une fois analysé.

---

## 0. Vue d'ensemble

| #   | Sujet                                                               | Écran                      | Statut                                                        |
| --- | ------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| 1   | Une seule icône « afficher le mot de passe »                        | Connexion                  | ✅ `d082d44` — icône native d'Edge masquée, vérifié dans Edge |
| 2   | Téléphone obligatoire pour tous à l'édition du profil               | Édition du profil          | ✅ `64da58c` — 8 chiffres minimum                             |
| 3.1 | Page « Mon profil » : en-tête                                       | Mon profil (nouveau)       | ✅ `a911dcd` — nouvelle page /profil                          |
| 3.2 | Page « Mon profil » : onglet Profil                                 | Mon profil (nouveau)       | ✅ `a911dcd`                                                  |
| 3.3 | Page « Mon profil » : onglet Entreprise                             | Mon profil (nouveau)       | ✅ `a911dcd`                                                  |
| 3.4 | Page « Mon profil » : onglet Opportunités                           | Mon profil (nouveau)       | ✅ `a911dcd`                                                  |
| 3.5 | Page « Mon profil » : onglet Services                               | Mon profil (nouveau)       | ✅ `a911dcd`                                                  |
| 3.6 | Barres d'onglets trop longues qui élargissent la page               | Toutes les pages à onglets | ✅ `ddd6da9`                                                  |
| 4.1 | Supprimer « Abonnements expirant bientôt »                          | Admin, Finances            | ✅ `5dc0742`                                                  |
| 4.2 | Export comptable en CSV et PDF, euros d'abord puis Ariary           | Admin, Finances            | ✅ `d89e72d`, `d8680af` — euros au prix officiel de l'offre   |
| 5.1 | Logo sur la page de connexion mobile                                | Connexion (mobile)         | ✅ `f443b16`                                                  |
| 5.2 | « Liste des membres » dans le menu du haut, juste après « Accueil » | Navigation mobile          | ✅ `76ad9fb`                                                  |
| 5.3 | Aucune page plus large que l'écran                                  | Toutes (mobile)            | ✅ `ddd6da9` — vérifié à 375 px sur 16 pages                  |
| 6.1 | Statut affiché = offre choisie à l'inscription                      | Règle transverse           | ✅ Déjà en place : paliers retirés en P2 (module 17)          |
| 6.2 | Badge réservé aux offres à prix fixe                                | Profils                    | ✅ `745a75a`                                                  |

---

## 1. Connexion — afficher le mot de passe

**Demandé :** le champ mot de passe affiche deux icônes pour afficher le mot de passe. N'en garder qu'une : la seconde, plus stable (bouton avec l'icône Lucide `eye`).

---

## 2. Édition du profil — téléphone obligatoire

**Demandé :** rendre le champ **Téléphone** obligatoire dans le formulaire d'édition du profil.
**Décision du 7 octobre :** obligatoire pour **tous les membres**, y compris ceux déjà inscrits sans numéro : ils devront en saisir un à leur prochaine modification de profil.

---

## 3. Page « Mon profil » (nouvelle page)

**Constat :** « Mon profil » ouvre directement l'édition du profil.
**Demandé :** une vraie page d'accueil du profil, présentée comme le profil public, avec un bouton vers l'édition.

### 3.1 En-tête

- Photo de profil ou logo
- Nom et prénom
- Fonction
- Nom de l'entreprise
- Pays
- Badge de l'offre, **uniquement pour une offre à prix fixe**, même règle que le profil public (§6.2). Les autres offres n'affichent rien.
- Bouton **« Éditer mon profil »**

### 3.2 Onglet « Profil »

- **Complétion du profil** : barre de progression (ex. « 88 % complété ») avec un lien **« Compléter maintenant »**.
- **Informations** : bio, téléphone, site web, e-mail, LinkedIn, secteurs d'intérêt.

### 3.3 Onglet « Entreprise »

- Les informations de l'entreprise du membre, en lecture.

### 3.4 Onglet « Opportunités »

- Les opportunités publiées par le membre et par son entreprise.
- Un bouton pour publier une nouvelle opportunité Deal Room.

### 3.5 Onglet « Services »

- Les services publiés par le membre et par son entreprise.
- Un bouton pour ajouter un service.

**Onglets prévus plus tard (hors périmètre) :** Mes rendez-vous, Mes créneaux (voir module 18).

### 3.6 Onglets sur mobile

**Constat du client :** la barre d'onglets est trop longue et élargit la page sur mobile.
**Demandé :** sur toutes les pages à onglets (« Mon profil », fiche entreprise, espace de gestion de l'entreprise), les onglets passent à la ligne quand ils ne tiennent pas sur la largeur de l'écran (`flex` avec retour à la ligne). Va de pair avec §5.3.

---

## 4. Administration — Finances

### 4.1 Supprimer « Abonnements expirant bientôt »

**Demandé :** retirer cette section de `/admin/finances`.
**Rappel du client :** la plateforme ne gère ni durée d'abonnement, ni crédits, ni statut « Chairman ».

### 4.2 Export comptable

**Demandé :**

- Export en **CSV** et en **PDF**.
- **Euros (€) en premier**, puis le montant converti en **Ariary** dans la colonne suivante.
- Conversion au **taux en vigueur au moment du paiement**.
- Le PDF reprend **le même contenu que le CSV**, mis en page.

---

## 5. Mobile

### 5.1 Connexion

- Ajouter le logo officiel sur la page de connexion en mobile (`/login`).

### 5.2 Liste des membres dans le menu du haut

- Ajouter « Liste des membres » dans la navigation du haut, **juste après « Accueil »**.
- Décision du 7 octobre : c'est la seule réorganisation demandée, le reste des menus mobiles ne change pas.

### 5.3 Largeur des pages

- Toutes les pages doivent tenir dans la largeur de l'écran (100 %), sans défilement horizontal.

---

## 6. Règles métier — statut et badges

### 6.1 Statut affiché

- Le statut d'un membre correspond uniquement à l'**offre choisie à l'inscription**.
- Pas de statut « Chairman », aucun lien avec des achats de crédits.

### 6.2 Badges sur les profils

- **Règle (décision du 7 octobre) :** une offre **à prix fixe** donne un badge, avec le nom de l'offre comme libellé. Une offre au prix par participant (groupements, Executive Pass) n'en donne pas.
- La règle se lit sur le mode de tarification de l'offre, déjà réglé dans l'admin : aucun nom d'offre écrit dans le code.
- Elle vaut partout où un profil s'affiche, y compris l'en-tête de « Mon profil » (§3.1).
- Offres actives à prix fixe (base locale, 7 octobre) : Platinum, Gold, Silver, Bronze, Partenaire Institutionnel. **Early Bird est passée au prix par participant** dans l'admin : elle n'a donc pas de badge. **À refaire dans l'admin de production**, la base locale ne part pas en production.
- _Partenaire Institutionnel_ existe déjà comme offre à prix fixe, non proposée à l'inscription : ces partenaires sont rattachés à la main. Les modalités restent à discuter plus tard.

---

## 7. Décisions

### Décisions du 7 octobre

| Point                                  | Décision                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Section 1 du document reçu             | Elle n'existe pas : rien ne manque.                                                     |
| Offre dans l'en-tête de « Mon profil » | Même règle que les autres profils (§3.1, §6.2).                                         |
| Badge                                  | Les offres à prix fixe, avec le nom de l'offre comme libellé (§6.2).                    |
| Early Bird                             | Passée au prix par participant dans l'admin, donc sans badge. À reporter en production. |
| Partenaires institutionnels            | Rattachés à la main, modalités à discuter plus tard.                                    |
| Devise de l'export                     | Euros d'abord, puis la conversion en Ariary (§4.2).                                     |
| Téléphone                              | Obligatoire pour tous à l'édition du profil (§2).                                       |
| Onglets sur mobile                     | Toutes les barres d'onglets trop longues doivent passer à la ligne (§3.6).              |
| Menus mobiles                          | Seulement ajouter « Liste des membres » après « Accueil » (§5.2).                       |
| Taux de conversion de l'export         | Le taux en vigueur au moment du paiement (§4.2).                                        |
| Contenu du PDF                         | Le même contenu que le CSV, mis en page (§4.2).                                         |

Plus aucun point ouvert : le lot est prêt à être analysé puis codé.

---

## 8. Après codage

**Calcul des euros dans l'export (§4.2) — tranché le 7 octobre.** Les euros sont le **prix officiel de l'offre** (25 000 € pour Gold) : prix unitaire × participants payés pour une offre au participant, prix × quantité pour un supplément. Sans prix en euros (événements), le montant en Ariary est converti au taux du jour du paiement. La colonne Ariary reste le montant réellement payé, et la colonne taux celle du jour du paiement (marquée « estimé » pour les paiements antérieurs au 7 octobre).

**À reporter en production :** passer Early Bird en prix par participant dans l'admin (§6.2) ; appliquer les deux migrations (`20261007120000_referential_catalog`, `20261007130000_payment_eur_rate`), ce que fait le déploiement.
