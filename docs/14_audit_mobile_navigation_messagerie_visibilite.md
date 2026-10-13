# Module 14 — Audit mobile : navigation, messagerie et visibilité des fonctionnalités

> **Statut :** Anomalies et recommandation documentées — aucun code écrit, travail à mener d'abord en local
> **Version :** 1.0
> **Date :** 22 septembre 2026
> **Projet :** CEO Summit — Plateforme Digitale
> **Documents liés :** `12` (audit offres/paiement, même méthode : attendu vs constaté)

---

## 1. Anomalie — Navigation mobile incomplète

### Comportement attendu

- **Menu header** (absent aujourd'hui) : Accueil, Profil, Mon Entreprise.
- **Menu footer** (barre de navigation basse) : Événements, Deal Room, Salles, Messages, Déconnexion.

### Comportement constaté

- Aucune navigation de type « header » sur mobile.
- La barre de navigation basse actuelle (`components/layout/mobile-bottom-nav.tsx`) ne contient que 5 entrées : **Accueil, Événements, Deal Room, Messages, Profil** — **Salles**, **Mon Entreprise** et **Déconnexion** en sont absents.

### État réel du code

`components/layout/app-shell.tsx` compose la mise en page membre : `MemberSidebar` (desktop, ≥768px) + `MobileBottomNav` (mobile, `md:hidden`) — **aucun composant « header mobile »** n'existe entre les deux, la sidebar est simplement masquée sous 768px sans équivalent de repli.

La sidebar desktop (`components/layout/member-sidebar.tsx`) contient, elle, la liste complète : Accueil, Deal Room, Événements, Liste des membres, Salles, Messagerie, Mon Profil, Mon Entreprise, plus `SignOutButton` (déconnexion). C'est cette liste complète qui n'a jamais été portée sur mobile — la barre basse a été conçue avec un sous-ensemble réduit (5 icônes, contrainte d'espace probable), sans mécanisme de repli pour le reste.

### Pistes pour le chiffrage (à discuter avant tout code)

- Un header mobile fixe (logo + éventuellement accès rapide Accueil/Profil/Mon Entreprise) est un nouveau composant, pas une extension de l'existant.
- La barre basse ne peut pas raisonnablement accueillir les 8 entrées de la sidebar desktop sans redesign (5 icônes tient déjà l'espace disponible) — Salles/Mon Entreprise/Déconnexion iraient soit dans le nouveau header, soit dans un menu « Plus » à ajouter à la barre basse.
- Écran(s) concerné(s) : `components/layout/app-shell.tsx`, `components/layout/mobile-bottom-nav.tsx`, nouveau composant header à créer.

---

## 2. Anomalie — Rupture d'affichage Messagerie sur mobile

### Comportement attendu

L'utilisateur doit pouvoir rédiger et envoyer des messages normalement sur mobile. Dans la Deal Room, pouvoir répondre à un message précis (citation/mention) pour fluidifier les discussions de groupe — cette demande concerne en réalité la **messagerie elle-même** : la Deal Room n'a pas de fil de discussion propre, elle route déjà vers `/messagerie` via un panneau de contact (`components/deal-room/contact-panel.tsx`) — une citation/mention ajoutée à la messagerie bénéficierait donc aussi aux échanges initiés depuis la Deal Room, sans rien construire de séparé pour elle.

### Comportement constaté

Rupture d'affichage (CSS) sur mobile : la zone de lecture des messages et la zone de saisie sont cassées et inutilisables. Sélecteur en cause, relevé par le testeur :

```css
.flex.h-\[calc\(100vh-140px\)\].overflow-hidden.rounded-lg.border.border-border.bg-white {
  display: flex;
  flex-direction: column;
}
```

### État réel du code — cause probable identifiée

Ce sélecteur correspond exactement à `app/messagerie/layout.tsx:78` :

```tsx
<div className="flex h-[calc(100vh-140px)] overflow-hidden rounded-lg border border-border bg-white">
```

`100vh` (viewport height statique) ne tient pas compte de la barre d'adresse mobile qui apparaît/disparaît au scroll — cause connue de ruptures de layout sur mobile (le conteneur peut dépasser la hauteur réellement visible, ou être mal calculé pendant les 1-2 premières secondes après chargement).

**Le correctif existe déjà ailleurs dans le code**, pour un écran très similaire — `components/rooms/room-chat.tsx:181` (Salles, aussi un fil de discussion plein écran) utilise :

```tsx
<div className="flex h-[calc(100dvh-140px)] flex-col rounded-lg border border-border bg-white md:h-[calc(100vh-140px)]">
```

C'est-à-dire `100dvh` (dynamic viewport height, s'ajuste à la barre d'adresse) sur mobile, et seulement `100vh` classique à partir de `md:` (desktop, où `dvh` n'apporte rien). `app/messagerie/layout.tsx` n'a jamais reçu ce même traitement — c'est très probablement la cause directe de la rupture constatée, un simple oubli de propagation du correctif plutôt qu'un problème nouveau à diagnostiquer.

### Pistes pour le chiffrage (à discuter avant tout code)

1. **Correctif CSS** (`h-[calc(100vh-140px)]` → `h-[calc(100dvh-140px)] ... md:h-[calc(100vh-140px)]` dans `app/messagerie/layout.tsx`) — même pattern que `room-chat.tsx`, changement localisé et à faible risque.
2. **Citation/mention dans la messagerie** — fonctionnalité nouvelle, à concevoir séparément (modèle de données : un message qui référence un message parent ; UI : sélectionner un message pour y répondre, afficher l'extrait cité au-dessus de la réponse). Portée plus large que le correctif CSS, à cadrer indépendamment.

---

## 3. Recommandation — Visibilité explicite des fonctionnalités à la création

### Contexte

Comportement attendu confirmé : Événements, Deal Room, Salles, envoi de messages et demande de connexion sont accessibles à l'ensemble des utilisateurs de la plateforme, quelle que soit leur offre.

### État réel du code — un système de tiers existe déjà, avec des défauts hétérogènes

Le schéma a déjà un mécanisme de restriction par palier (`Tier`) sur ces trois entités, mais avec des valeurs par défaut incohérentes entre elles :

| Entité                    | Champ                                                                       | Défaut actuel | Effet                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Event`                   | `minTier`                                                                   | `MEMBER`      | Tier le plus bas — équivaut déjà à peu près à « tout le monde »                                                   |
| `Opportunity` (Deal Room) | `visibility` (legacy) + `visibilityPlanId` (dynamique, remplace le premier) | `EXECUTIVE`   | **Restreint par défaut** — une nouvelle opportunité n'est _pas_ visible de tous sans action explicite du créateur |
| `Room` (Salle)            | `minTier` (`RoomAccessLevel`)                                               | `ALL_MEMBERS` | Déjà « tout le monde » par défaut                                                                                 |

Concrètement, seule `Opportunity` s'écarte du comportement attendu par défaut — une Deal Room créée sans que son auteur touche au champ de visibilité reste réservée aux membres Executive et au-dessus, contrairement à ce que ce module décrit comme attendu.

### Recommandation

Ajouter, sur les formulaires de création (Événement, Deal Room, Salle), une option de filtrage explicite pour définir la visibilité — au minimum une valeur « Tout le monde » clairement proposée, plutôt que de dépendre d'un défaut de schéma que le créateur ne voit pas forcément. Deux décisions à trancher avant tout code, pas seulement une question d'implémentation :

1. **Faut-il garder le système de paliers (`Tier`/`RoomAccessLevel`/`visibilityPlanId`) tel quel** et juste exposer « Tout le monde » comme une valeur possible dans son sélecteur existant, ou le business veut-il autre chose (ex. un simple public/privé, sans notion de palier) ?
2. **Faut-il changer le défaut d'`Opportunity`** (`EXECUTIVE` → un équivalent « tout le monde ») pour que le comportement par défaut corresponde à l'attendu confirmé, même avant que l'UI de filtrage explicite soit construite ?

Pas de recommandation technique supplémentaire à ce stade — ce point nécessite un arbitrage produit avant chiffrage, contrairement aux deux anomalies précédentes qui ont une cause déjà identifiée.
