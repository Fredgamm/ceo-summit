# Module 23 — Connexions entre membres : recommandation

> **Statut :** recommandation, **à développer plus tard** (décision du 3 novembre 2026). Rien n'est codé. À valider par le client avant de rédiger la spécification détaillée.
> **Date :** 3 novembre 2026
> **Origine :** demande faite en revoyant l'en-tête du profil membre : après « Se connecter », les deux membres doivent pouvoir s'envoyer des messages, et le bouton doit ensuite permettre de supprimer la relation, sur le modèle de LinkedIn.

---

## 1. Où en est la plateforme

| Sujet            | Aujourd'hui                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bouton du profil | « **Message** » (icône d'envoi) et « **Se connecter** » côte à côte (3 novembre 2026). « Se connecter » est **grisé**, avec l'info-bulle « Disponible avec le Deal Room (bientôt) ».                          |
| Connexions       | **Aucune table, aucune action.** Rien n'est enregistré.                                                                                                                                                       |
| Messagerie       | **Ouverte à tous** : n'importe quel membre actif peut écrire à n'importe quel autre. `startConversation` (`app/actions/messages.ts`) ne vérifie que le compte actif et l'interdiction de s'écrire à soi-même. |
| Deal Room        | Une « demande de contact » existe, mais elle est liée à une opportunité et reste distincte d'une connexion.                                                                                                   |
| Rendez-vous B2B  | Aucun lien avec la messagerie en V1. La spécification prévoit en V2 d'ouvrir une conversation à la confirmation d'un rendez-vous (D15).                                                                       |

## 2. Fonctionnement recommandé

Sur le modèle de LinkedIn, vu depuis le profil d'un autre membre :

| État entre les deux membres | Bouton principal                      | Message                                      |
| --------------------------- | ------------------------------------- | -------------------------------------------- |
| Aucune relation             | **Se connecter**                      | selon la règle de la section 3               |
| Demande envoyée par moi     | **Demande envoyée** (annulable)       | selon la règle de la section 3               |
| Demande reçue de lui        | **Accepter** et **Ignorer**           | selon la règle de la section 3               |
| **Connectés**               | **Supprimer la relation**             | **disponible**, pour les deux                |
| Relation supprimée          | **Se connecter** (on peut redemander) | historique lisible, plus d'envoi (section 4) |

Précisions :

1. **Qui peut demander** : tout membre actif, vers tout autre membre actif. Une demande en attente à la fois par couple de membres. Un refus (« Ignorer ») est silencieux : l'autre voit seulement que la demande reste sans réponse, comme sur LinkedIn.
2. **Suppression** : le bouton « Supprimer la relation » est **discret** (petit menu, pas un grand bouton) et demande une **confirmation**, pour éviter un clic par erreur. Aucune notification n'est envoyée à l'autre membre.
3. **Notifications** : pastille dans la navigation et email « Demande de connexion » (modèle dans la bibliothèque d'emails, catégorie à créer), « Demande acceptée » à l'envoyeur.
4. **Plafond** : un nombre maximal de demandes en attente par membre (par exemple 50), pour limiter les abus, comme pour les demandes de rendez-vous (10).

## 3. La décision à prendre : bloquer ou non la messagerie sans connexion

### Option A — recommandée : écrire à un nouveau contact exige d'être connecté

Comme sur LinkedIn : tant qu'il n'y a pas de connexion, « Message » est remplacé par une invitation à se connecter. Cela protège les membres contre les messages non sollicités.

**Exceptions nécessaires pour ne rien casser :**

- les **conversations déjà existantes** (en production) restent ouvertes, sinon des échanges en cours se coupent du jour au lendemain ;
- une **demande de contact acceptée dans le Deal Room** ouvre la messagerie, et crée la connexion automatiquement ;
- un **rendez-vous B2B confirmé** ouvre la messagerie, et crée la connexion automatiquement (c'est la décision D15, ainsi simple à tenir) ;
- les **équipes d'organisation** (admin) peuvent toujours écrire.

### Option B — messagerie libre, connexion = carnet de contacts

La messagerie reste ouverte à tous comme aujourd'hui. La connexion sert seulement à garder une liste de contacts. Plus simple, mais « Supprimer la relation » n'a alors pas d'effet réel sur les échanges, ce qui contredit l'intention de la demande.

**Recommandation : option A, avec les exceptions ci-dessus.**

## 4. Après une suppression de la relation

- **L'historique des messages reste lisible** pour les deux membres (rien n'est supprimé).
- **Plus de nouveaux messages** tant qu'ils ne sont pas reconnectés. Le champ de saisie est remplacé par « Vous n'êtes plus connectés. Se connecter ».
- Exception : si une des ouvertures automatiques de la section 3 s'applique à nouveau (nouveau rendez-vous confirmé, nouvelle demande de contact acceptée), la connexion est recréée.

## 5. Ce qu'il faudra construire

| Élément             | Détail                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Données             | Table `MemberConnection` : les deux membres, qui a demandé, statut (en attente, acceptée), dates ; unique par couple de membres.                         |
| Actions             | Demander, annuler, accepter, ignorer, supprimer (contrôles côté serveur, journal d'audit pour les suppressions).                                         |
| Profil              | Les boutons de la section 2, dans l'en-tête de `/membres/[id]` ; un onglet ou une page « Mes connexions » pour voir les demandes reçues.                 |
| Messagerie          | Règle de l'option A dans `startConversation` **et** à l'envoi d'un message (le serveur de messagerie en temps réel doit aussi l'appliquer).              |
| Reprise des données | Les conversations existantes doivent être préservées : soit une connexion créée pour chaque conversation existante, soit une exception « fil existant ». |
| Emails              | 2 modèles : demande reçue, demande acceptée.                                                                                                             |
| Tests               | Règles de la messagerie (cas avec et sans connexion, exceptions), concurrence (demandes croisées), mobile.                                               |

**Estimation : 3 à 4 jours**, hors validation du client.

## 6. Points à valider avec le client

1. **Option A ou B ?** (section 3).
2. Après une suppression, l'**historique reste lisible** et les nouveaux messages sont bloqués : d'accord ? (section 4)
3. Les **ouvertures automatiques** (rendez-vous confirmé, demande de contact acceptée) créent-elles bien une connexion ?
4. **Plafond de demandes en attente** : 50 est-il adapté ?
5. Le libellé **« Se connecter »** peut être pris pour une connexion à son compte. Le client préfère-t-il « Se mettre en relation » (plus long sur mobile) ou garde-t-il « Se connecter » ?
6. Faut-il un **blocage** d'un membre indésirable (qui empêche aussi toute demande) ? Non prévu ici ; à décider, c'est un sujet à part.

## 7. Ordre de travail proposé

1. Terminer d'abord la **recette des rendez-vous** (lot 10 du module 21).
2. Faire valider ce document par le client, puis rédiger la spécification détaillée.
3. Développer, en local d'abord, comme pour les rendez-vous ; ni préprod ni production sans accord explicite.
