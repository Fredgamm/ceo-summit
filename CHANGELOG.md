# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/) —
entrées groupées par date, les plus récentes en premier.

## 2026-09-22

### Ajouté

- **Cumul de places et achats de supplément (upsell)** — une entreprise qui a
  atteint le plafond de son offre peut désormais acheter des places
  supplémentaires (ex. Executive Pass à l'unité, ou une offre Groupement en
  lot) sans que ça n'affecte son accès pendant la revue admin.
- **Bascule automatique d'offre selon la quantité** — que ce soit à l'achat
  d'un supplément ou au paiement initial, saisir un effectif qui atteint le
  seuil d'une offre Groupement bascule automatiquement dessus (palier le
  plus élevé atteint en priorité), au lieu de facturer au tarif de l'offre
  choisie au départ.
- **Case « Je participe »** — le gestionnaire qui inscrit l'entreprise et
  paie ne consomme une place que s'il se déclare lui-même participant.
- **Bouton Renvoyer** pour une invitation collaborateur restée en attente —
  régénère le lien et renvoie l'email sans passer par révoquer/réinviter.
- **Champ Site web** sur le profil membre (`/profil/editer`), affiché aussi
  sur le profil public et la fiche admin.
- **`CHANGELOG.md`** — ce fichier.

### Modifié

- **Modèle de tarification des offres simplifié** à deux modes cohérents
  (Forfait à prix fixe / Groupement à prix par personne) — le mode
  `TIERED_GROUP` (paliers dégressifs), jamais utilisé par aucune offre
  active, a été retiré (schéma, UI admin, calculs).
- Une offre Groupement est désormais **automatiquement proposable en
  supplément**, sans configuration manuelle — la case à cocher correspondante
  a été retirée du formulaire admin.
- Le mode de paiement du formulaire de supplément est aligné sur celui du
  paiement initial (virement, chèque, carte bancaire, Mobile Money — ces
  deux derniers en attente du pont Evolia).
- Le champ quantité (supplément et paiement initial) est durci contre les
  saisies invalides (négatif, décimal, notation scientifique) et clampé au
  seuil minimum de l'offre.
- Nom complet et Titre / Poste sont désormais réellement obligatoires sur le
  profil membre (Titre / Poste acceptait une chaîne vide malgré l'astérisque
  affiché).
- Site web et LinkedIn (profil membre) acceptent une saisie sans schéma
  explicite (`https://` ajouté automatiquement avant validation).
- Le bouton « Inviter des collaborateurs » du dashboard est maintenant un
  vrai bouton visible, plus un simple lien texte.
- La quantité par défaut du formulaire de supplément démarre toujours à 1.

### Corrigé

- **Invitation collaborateur cassée en local** — `CompanyInvite.expiresAt`
  existait déjà dans la base partagée (ajouté par une autre branche) mais
  pas dans le schéma de cette branche, provoquant une erreur 500 sur chaque
  invitation. Le champ est maintenant aligné (avec expiration à 7 jours,
  comme les autres invitations).
