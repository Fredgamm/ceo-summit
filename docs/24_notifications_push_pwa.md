# Module 24 — Notifications push de la PWA

> **Statut :** développé en local le 4 novembre 2026, **pas encore déployé**.
> **Branche :** `feat/rdv-b2b-v1-suite` (suite du module 21).

## Objectif

Prévenir un membre **tout de suite**, application fermée, quand quelque chose attend sa réponse :
demande de rendez-vous reçue, réponse (confirmé ou refusé), expiration, annulation par
l'organisation, mot du partenaire, ouverture des créneaux. Aujourd'hui : email + cloche (visible
seulement dans l'application ouverte).

## Fonctionnement

| Élément | Rôle |
|---|---|
| `prisma` `PushSubscription` | un appareil abonné par un membre (adresse du service de push + deux clés) ; plusieurs appareils possibles |
| `worker/index.js` | code ajouté au service worker de next-pwa : affiche la notification (`push`) et ouvre la bonne page au toucher (`notificationclick`) |
| `lib/push.ts` | `sendPushToUser(userId, payload)` : envoie à tous les appareils, supprime ceux que le service de push dit disparus (404/410), ne lève jamais |
| `lib/meeting-push.ts` | textes des 8 notifications du module Rendez-vous |
| `lib/meeting-emails.ts` | chaque envoi d'email envoie aussi le push correspondant (mêmes déclencheurs, donc rien à brancher ailleurs) |
| `app/actions/push.ts` | abonner / désabonner l'appareil, clé publique, bouton « Envoyer un test » |
| `components/notifications/push-toggle.tsx` | carte en tête de la page **Notifications** : activer, tester, désactiver |

Sans clés VAPID sur le serveur, tout est inactif : la carte n'apparaît pas et rien n'est envoyé.
Un push est un signal court (qui, quand, lien vers « Mes rendez-vous ») ; le détail reste dans
l'email et dans l'application. Le lien du push est toujours un chemin interne.

## Compatibilité

- **Android, ordinateur** : depuis le navigateur ou l'application installée.
- **iPhone / iPad** : seulement dans l'application **ajoutée à l'écran d'accueil**, iOS 16.4 ou plus.
  Dans Safari la carte explique la marche à suivre.
- Navigation privée : le push n'existe pas.

## Mise en service (par instance)

1. `npx web-push generate-vapid-keys` — une paire **par instance** (préprod, prod).
2. Dans le `.env` de l'instance : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (`mailto:hello@ceo-summit.mg`), puis recréer le conteneur `app`.
3. Ne jamais changer la paire ensuite : les appareils abonnés devraient se réabonner.
4. Migration `20261104100000_push_subscriptions` (additive) appliquée au démarrage.
5. Dépendance ajoutée : `web-push` ; `package-lock.json` régénéré avec npm 10.8.2.

## Vérifié en local

- Build de production : `sw.js` charge bien `worker-*.js` (gestionnaires `push` et `notificationclick`).
- Navigateur réel (Chromium) : service worker actif, carte et bouton « Activer » affichés ;
  un message push injecté dans le service worker affiche la notification avec son titre, son
  texte, son `tag` et son lien.
- Tests unitaires : envoi, nettoyage des appareils disparus, absence de clés, liens externes
  refusés, textes de chaque notification.

## Non vérifié (à faire sur un vrai téléphone, après déploiement en préprod)

- L'abonnement réel et l'arrivée d'un push passent par les serveurs des navigateurs (FCM, Apple) ;
  le navigateur de test automatisé n'y a pas accès.
- Parcours : activer sur l'appareil → demande de rendez-vous depuis un autre compte → notification
  → toucher → arrivée sur « Mes rendez-vous ». À refaire sur Android et sur iPhone (application installée).

## Suites possibles

- Push pour les nouveaux messages de la messagerie et les demandes de contact du Deal Room.
- Préférences par type de notification ; heures calmes.
