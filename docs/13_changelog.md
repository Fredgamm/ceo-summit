# Module 13 — Changelog

> **Statut :** Vivant — mis à jour à chaque évolution notable
> **Projet :** CEO Summit — Plateforme Digitale
> **Format :** inspiré de [Keep a Changelog](https://keepachangelog.com/fr/) — entrées groupées par date, les plus récentes en premier.

---

## 2026-10-26 — Organisation unique du staff, retrait de la préinscription

Pas encore déployé à la date de cette entrée.

### Ajouté

- **Organisation du staff** : une seule organisation regroupe le staff : **Becom**, l'entreprise organisatrice (désignée par la migration `20261026100000_staff_organization` à partir de l'organisation « CEO Summit » gérée par un administrateur, puis renommée « Becom » par `20261026120000_staff_organization_becom` ; nouvelle colonne `Company.isStaffOrganization`). Tout **super admin** actif la gère comme son gérant : inviter des membres, désigner les participants, modifier la fiche, choisir l'offre staff, sans en être le gérant en titre.
- **Administrateurs rattachés au staff** : un administrateur créé depuis Admin › Paramètres y est directement rattaché ; un membre promu y est déplacé (refusé s'il gère une organisation qui a d'autres membres : transférer d'abord la gestion). Onglet Administrateurs : carte « Organisation du staff » (lien « Gérer l'équipe », ou choix de l'organisation si aucune n'est désignée), mention « Hors staff » et bouton « Rattacher au staff » pour les administrateurs créés avant cette règle.
- **Comptes Becom / CEO Summit déjà inscrits** (migration `20261026110000_staff_members`) : tous les comptes `@ceo-summit.mg` et `@mg-becom.com` rejoignent l'organisation du staff, administrateurs ou non. Même règle que le rattachement : un gérant seul dans son organisation la quitte (elle reste, vide et sans gérant, avec son historique de paiements) ; un gérant d'une organisation qui a d'autres membres n'est pas déplacé.

### Retiré

- **Préinscription** (Admin › Paramètres › Tarifs & Règles, entrée du 23 octobre) : changement de direction, les paiements sont ouverts tout de suite par virement et chèque, la carte et le Mobile Money attendant l'activation d'Evolia (Paramètres › Intégrations). Disparaissent : le cadre « Préinscription » et l'e-mail d'ouverture, l'écran « Votre préinscription est enregistrée », le mail « Bienvenue gestionnaire — préinscription » (le mail de bienvenue habituel est toujours envoyé) et le modèle « Préinscription — ouverture des paiements ». Aucune migration : le réglage `registration.payments_open_on`, s'il existe en base, n'est simplement plus lu.

---

## 2026-10-23 — Préinscription, dates limites des offres, coordonnées bancaires

Pas encore déployé à la date de cette entrée.

### Ajouté

- **Préinscription** (Admin › Paramètres › Tarifs & Règles) : un jour d'ouverture des paiements. D'ici là, une entreprise crée son compte, choisit son offre et, pour une offre groupement, indique son nombre de participants, **sans être obligée de payer**. L'étape Paiement affiche « Votre préinscription est enregistrée » avec la date d'ouverture, et propose de régler dès maintenant avec les modes disponibles.
- **Activation d'Evolia** (Paramètres › Intégrations, case « Evolia activé (clé de production validée) », confirmée par mot de passe). Tant qu'elle est décochée : **rien n'est envoyé à Evolia**, quel que soit le mode de paiement — inscriptions et listes de participants sont enregistrées avec le statut « Retenu » (visible sur la fiche entreprise) — et la carte / le Mobile Money ne sont pas proposés (refusés aussi côté serveur) ; virement et chèque restent possibles. À l'activation, **tous les envois retenus partent** : inscriptions d'abord, puis la liste de participants la plus récente de chaque entreprise ; sont écartés (« Non transmis ») l'inscription d'un paiement annulé entre-temps et les listes remplacées. Nouveaux statuts `HELD` / `SKIPPED` (migration `20261023120000_evolia_push_held`).
  - Le cadre affiche le nombre d'entreprises en attente de paiement et, une fois les paiements ouverts, un bouton « Envoyer l'e-mail d'ouverture » (modèle « Préinscription — ouverture des paiements », modifiable dans Admin › E-mails).
  - Pendant la préinscription, le mail de bienvenue du gestionnaire est remplacé par « Bienvenue gestionnaire — préinscription » (pas de « procédez au paiement »).
- **Date limite par offre** (« Disponible jusqu'au », Admin › Offres) : après ce jour (fin de journée, heure de l'événement), l'offre n'est plus proposée, ne peut plus être choisie et ne peut plus être payée, même par une entreprise qui l'avait choisie. Celle-ci est invitée à changer d'offre. La liste des offres de l'admin affiche la date, ou « Expirée ». Nouvelle colonne `Plan.availableUntil` (migration `20261023100000_plan_available_until`).
- **Coordonnées bancaires BECOM** (BRED Madagasikara : IBAN, BIC, RIB, avec copie) affichées pour un virement ou un chèque, au paiement de l'offre et à l'achat de places supplémentaires.

### Sécurité des paiements (revue complète du 23 octobre)

- **Double encaissement** : l'admin ne peut plus valider un paiement d'offre quand l'accès est déjà actif (message « doublon, à refuser et rembourser ») ; une confirmation d'Evolia dans ce cas est enregistrée mais signalée « double paiement à rembourser », sans réactiver ni prolonger l'abonnement. L'activation elle-même est conditionnelle (deux confirmations simultanées n'activent qu'une fois).
- **Double envoi** d'un même paiement (deux onglets, double clic) : un seul paiement est créé.
- **Confirmation tardive après changement d'offre ou d'effectif** : comparée à ce qui avait été envoyé à Evolia ; en cas d'écart, rien n'est activé automatiquement, le paiement reste en attente avec une note pour l'admin.
- **Webhook** : ne confirme plus que des paiements carte / Mobile Money (un virement se valide uniquement par l'admin).
- Un paiement annulé faute de réponse d'Evolia reste honoré si le client paie malgré tout.
- **Offre expirée** : reste payable par l'entreprise qui avait engagé un paiement avant la date limite (preuve refusée, carte annulée).
- **Envois à Evolia** : listes de participants recalculées au moment de l'envoi (jamais un instantané périmé) ; une liste ne part qu'une fois l'inscription de l'entreprise reçue par Evolia ; « Transmettre les envois retenus » réessaie aussi les inscriptions en échec ; transmission en arrière-plan ; activation impossible sans clé, clé non supprimable tant qu'Evolia est activé ; un envoi écarté ne peut pas être renvoyé.
- Préinscription : alerte dans l'admin quand une offre expire avant l'ouverture des paiements ; e-mail d'ouverture refusé sans date configurée.

### Données corrigées (préprod et prod)

- Événement : « CEO Summit Indian Ocean, 3e édition », 11 mars 2027 08:00 → 12 mars 2027 22:00, Le Moca, Domaine de Montgaillard, La Réunion, fuseau La Réunion.
- Offres de groupe renommées « Accès + 10 participants » et « Accès + 30 participants ».

---

## 2026-10-21 — Evolia configurable depuis l'admin, navigation et mobile

Pas encore déployé à la date de cette entrée.

### Ajouté

- **Configuration Evolia dans Paramètres › Intégrations** (super admin uniquement) : les trois valeurs fournies par Evolia, à recopier telles quelles. Plus besoin de modifier le `.env` ni de redémarrer le serveur.
  - **Adresse d'envoi des inscriptions** (`https://api-event.aiolia.us/integration/ceosummit/registrations`) ;
  - **Lien de paiement** (`https://event.aiolia.us/ceosummit/payment/{ceoSummitReference}`) ;
  - **Clé Evolia** : une seule clé, qui signe nos envois et vérifie leurs confirmations de paiement (déjà la même dans `EVOLIA_WEBHOOK_SECRET` et `PAYMENT_WEBHOOK_SECRET`).
  - Priorité : valeur saisie dans l'admin, puis variable d'environnement, puis valeur par défaut. Tant que rien n'est saisi, rien ne change.
- **Barre de progression** en haut de l'écran à chaque clic sur un lien, et indicateur de chargement dans le back-office : avant, rien ne bougeait pendant le rendu de la page suivante.
- **Favicon CEO Summit** à la place de celui de Next.js par défaut.
- **Mobile** :
  - onglets sur une seule ligne qui défile (fiche entreprise, profil, fiche membre admin) au lieu de passer à la ligne ;
  - en-têtes de la fiche entreprise et du profil recomposés ; bouton « Ajouter une description » pour le gérant ;
  - formulaire entreprise (création et modification) : un champ par ligne, bouton « Choisir un logo » ;
  - secteurs d'intérêt (profil, onboarding) en liste à cocher ;
  - Deal Room : bouton « Filtres » avec le nombre de filtres actifs, tri à côté, filtres en grille ; cartes d'opportunité avec budget et échéance (jours restants) mis en avant.

### Corrigé

- **Client bloqué après une annulation chez Evolia** : la page « Paiement en cours chez Evolia » promettait de « choisir un autre mode de paiement », mais le bouton n'apparaissait qu'au bout de 15 minutes. Il est maintenant disponible tout de suite (avec confirmation). Il annule le paiement en attente et ramène à l'étape Paiement. Si Evolia confirme malgré tout plus tard, le paiement est honoré et un éventuel double paiement est signalé, comme avant.
- **`payment.failed` d'Evolia** sur un paiement d'entreprise : il annule désormais le paiement en attente et rend l'étape Paiement au client (il était seulement journalisé).
- La page indique le site de paiement d'Evolia (`event.aiolia.us`), pour qu'une adresse différente du nom « Evolia » n'inquiète pas le client.

### Retour de test du 21 octobre

- Inscription : « Mon identité », « Mon organisation », « Nom de l'organisation » (ex. BECOM SARL) ; nouveau texte sous Secteur / Pays.
- Listes secteur et pays : toutes les valeurs à l'ouverture, « Rechercher… » en tête pour une longue liste (il n'en montrait que 10).
- Paiement : nouvelle aide sous « Nombre de participants » ; message vers l'offre de groupe dès son seuil atteint ; nouveaux textes pour Evolia et pour la vérification d'un virement.
- E-mails : logo Becom et signature « Conquérir de nouveaux possibles – The power to go beyond » dans l'en-tête ; téléphone 038 09 131 14 et nouveau texte de pied de page ; mail de bienvenue du gestionnaire réécrit ; confirmation d'inscription reformulée.

### Brevo pour les communications

- Les diffusions d'Admin › Communications partent par **Brevo** quand une clé d'API est enregistrée (Paramètres › Intégrations : clé chiffrée, adresse et nom d'expéditeur, bouton « Tester la connexion » avec les crédits restants). Un appel Brevo par tranche de 1000 destinataires ; prénom, nom et entreprise passés en paramètres. Une diffusion de test passe par le même canal.
- Sans Brevo, les diffusions partent par la boîte ceo-summit.mg **par paquets de 5** (elles partaient toutes en même temps).
- Les e-mails automatiques (mot de passe, paiements…) restent sur la boîte ceo-summit.mg.
- En cas d'échec, la raison donnée par Brevo s'affiche (clé refusée, crédits épuisés, expéditeur non validé).

### Déconnexion, actualisation et mot de passe oublié

- **Déconnexion qui ne faisait rien** : le service worker mettait en cache les appels d'authentification (`/api/auth/csrf`, `/api/auth/session`) ; sur un réseau lent, la déconnexion attendait 10 s puis envoyait un jeton périmé, refusé. Ces appels ne passent plus par le cache ; le bouton affiche « Déconnexion… », vide les pages du compte gardées en cache et, en cas d'échec, bascule sur la page de déconnexion de NextAuth.
- **Pages qui ne s'actualisaient pas** : les pages membres venaient d'abord du cache (jusqu'à 24 h). Elles viennent maintenant du serveur ; le cache ne sert que hors connexion ou au-delà de 4 s sans réponse.
- **Mot de passe oublié** : une erreur imprévue n'affichait rien ; elle s'affiche. Écran de confirmation « Vérifiez votre boîte mail » avec renvoi du lien (après 60 s) et changement d'adresse.

### Sécurité

- Clé **chiffrée en base** (AES-256-GCM, clé dérivée de `NEXTAUTH_SECRET`), jamais renvoyée au navigateur : l'écran n'affiche que ses 4 derniers caractères.
- Toute modification exige le **mot de passe** de l'admin, est limitée à 5 tentatives par 15 minutes et est inscrite au journal d'audit (`settings.evolia.update`), sans la clé.
- Adresses refusées si elles ne sont pas en `https://`, pointent vers une adresse interne (localhost, réseau privé) ou contiennent un identifiant.

### À savoir

- **Changer `NEXTAUTH_SECRET` rend la clé saisie illisible** : la plateforme repasse alors sur les variables d'environnement, et l'onglet Intégrations demande de la ressaisir.
- Ne remplacer la clé dans l'admin **qu'au moment où Evolia bascule sur la nouvelle**, sinon leurs confirmations de paiement (ou nos envois) sont refusées.

### Développement

- `next dev --turbopack` fonctionne désormais dans les worktrees (`turbopack.root` dans `next.config.mjs`) : démarrage en 4,5 s au lieu de 36 s.

---

## 2026-10-20 — Evolia : fonction et ticket des participants

À la demande d'Evolia, pour les badges. Pas encore déployé à la date de cette entrée.

### Ajouté

- **Fonction et ticket de chaque participant** dans les envois à Evolia (`company.registration.pushed` et `company.participants.confirmed`) :
  - `title` : la fonction du participant. Celle du gérant part dès le paiement (il est alors le seul participant envoyé), puis à nouveau avec la liste validée ;
  - `ticket` : `{ type, description }` de l'offre liée à l'inscription du participant, à défaut celle de son entreprise.
- **Fonction demandée à chaque arrivée** sur la plateforme :
  - invitation d'un collaborateur : le gérant saisit sa fonction, que le collaborateur confirme ou corrige en acceptant ;
  - inscription d'une entreprise et d'un partenaire institutionnel : champ « Fonction » obligatoire ;
  - validation de la liste des participants : un participant coché sans fonction (compte ancien) fait apparaître un champ à remplir ; la liste ne part pas vers Evolia tant qu'il est vide.
  - la fonction saisie à cette étape est enregistrée sur le compte du participant.
- Nouvelle colonne `CompanyInvite.title` (migration `20261020120000_company_invite_title`).
- Documentation d'intégration (`docs/11`) et page publique `/integration-evolia` mises à jour.

### Décidé

- **La photo de profil n'est pas transmise** à Evolia : elle est facultative, et l'exiger bloquerait des participants.

### À savoir

- Un gérant inscrit **avant le 20 octobre** qui n'a jamais renseigné sa fonction dans son profil est envoyé avec `title: null` au paiement : la fonction n'existe pas en base. Elle lui est demandée à la validation de la liste des participants, qui la renvoie à Evolia. Les gérants inscrits depuis ce changement ont toujours une fonction.

---

## 2026-10-14 — deux environnements, audit de sécurité, Next 15, ergonomie mobile

### Ajouté

- **Deux instances sur le serveur** : production sur `b2b.ceo-summit.mg` (branche `production`), préproduction sur `app.ceo-summit.mg` (branche `mvp-connect-simple`). Une seule image Docker sert les deux, et plus aucune adresse n'est écrite en dur (e-mails, page d'intégration Evolia, temps réel).
- **Confirmation de l'adresse e-mail avant le paiement** : un lien à usage unique (72 h) est envoyé à l'inscription. La page de paiement attend la confirmation, avec la possibilité de renvoyer le lien ou de corriger l'adresse. Une adresse inventée ne peut plus aller jusqu'au paiement.
- **Offre « Staff » gratuite** pour l'organisation de l'administrateur de la plateforme : son équipe est inscrite à l'événement et transmise à Evolia, sans parcours d'achat.
- **E-mails** : coordonnées de CEO Summit en pied de page, version texte jointe au HTML et réponses dirigées vers rp@ceo-summit.mg, pour limiter le classement en spam. L'e-mail « Paiement confirmé » a un bouton « Me connecter », qui mène à la désignation des participants.

### Modifié

- **Migration vers Next 15.5.27 et React 19** : la version 14 n'est plus corrigée.
- **Gestion compte** : après paiement, la carte des participants à l'événement passe en premier.
- **Page événement** : les participants inscrits s'affichent en cartes cliquables vers leur profil.
- **Paiement (étape 3)** : les deux familles de paiement sont présentées sur deux lignes distinctes (carte / Mobile Money via Evolia ; virement / chèque avec preuve).
- **Mobile** :
  - menu du bas avec les écrans du quotidien (Accueil, Membres, Salles, Messages, Entreprise) ; déconnexion depuis « Mon profil » ;
  - liste des membres : filtres compacts sur une ligne, tri « En vedette » au lieu de « Offre (plus chère d'abord) » ;
  - salles et messagerie : conversation en plein écran, zone de saisie qui s'agrandit, état « Connexion… » visible.

### Sécurité

- **Audit du 14 octobre** :
  - chaque requête relit le compte en base : un compte suspendu, exclu ou dont le mot de passe a changé perd sa session immédiatement ;
  - le type des pièces jointes et des preuves de paiement est vérifié sur le contenu du fichier ;
  - le jeton du temps réel n'accepte que l'algorithme HS256 ;
  - dépendances corrigées (sharp, source-map-js).
- **Infrastructure** : sauvegardes lisibles par leur seul propriétaire, action de déploiement épinglée, durcissement du serveur (voir `docs/22`).

---

## 2026-10-10 au 13 — paiement au cours du jour, sauvegardes

### Ajouté

- **Bouton « Installer l'application »** dans les menus : il ouvre l'installation du navigateur, ou à défaut des instructions selon l'appareil.
- **E-mail « Paiement reçu — en cours de vérification »**, envoyé au gérant quand il envoie sa preuve de virement ou de chèque.

### Modifié

- **Montants en Ariary au cours du jour**, y compris le **montant facturé** des offres cotées en euros. Il était auparavant figé au jour d'enregistrement de l'offre. Le taux est enregistré avec chaque paiement.
- **Taux de secours** : en cas de panne de la source du cours, le dernier taux reçu (celui de la veille, conservé en base) est utilisé, et non plus un taux fixe.
- Un membre dont le paiement n'est pas encore validé n'apparaît plus dans « Nouveaux membres » ni dans l'annuaire.
- Textes des étapes 2, 3 et 4 du parcours d'adhésion reformulés.
- La documentation de conception est désormais dans `docs/` du dépôt de l'application.

### Corrigé

- **Sauvegardes nocturnes** : elles échouaient depuis le 14 septembre (script devenu non exécutable). Corrigé le 13 octobre, sauvegarde vérifiée.

---

## 2026-10-08 et 09 — rendez-vous B2B (module 21), intégration Evolia finalisée, parcours d'adhésion

### Ajouté

- **Rendez-vous B2B en événement** (module 21) :
  - fuseau horaire par événement (Madagascar, La Réunion, Maurice…), transmis à Evolia ;
  - admin : génération et publication des créneaux de rendez-vous d'un événement ;
  - membre : onglet « Mes créneaux » pour activer ses disponibilités, et demande de rendez-vous depuis le profil d'un autre participant ;
  - réservés aux événements « Summit annuel » sur place et aux membres inscrits par une offre liée.
- **Pièces jointes d'événement** (PDF, images, documents) à la place des intervenants.
- **Inscription automatique** des membres d'une entreprise à l'événement de son offre, dans la limite des places (le gérant d'abord, puis par date d'arrivée).
- **Paiement abandonné** : bouton « Changer de mode de paiement », 15 minutes après le début d'un paiement par carte ou Mobile Money. Une confirmation tardive d'Evolia est honorée, et un double paiement est signalé.
- **Page de retour après paiement Evolia** (`/entreprise/paiement/confirmation`) : elle attend la confirmation, puis ouvre la désignation des participants.
- **Refonte du parcours d'adhésion** : étapes visibles (offre, compte, paiement, activation), carte de membre qui se complète au fil du parcours, modes de paiement en tuiles.
- **Déploiement** : l'image est compilée dans GitHub Actions et non plus sur le serveur, et le site tourne en plusieurs processus.

### Modifié

- **Intégration Evolia mise en conformité avec leur API** :
  - nouvelle adresse `api-event.aiolia.us` (l'ancienne menait à leur site web, bloqué par Cloudflare) ;
  - `paymentMethod` au format attendu (`evolia` / `virement`) ;
  - `ceoSummitReference` sur chaque envoi, liste de participants jamais vide ;
  - partenaires institutionnels inscrits avant leur première liste ;
  - message lisible dans l'admin en cas d'échec d'un envoi.
- **Page événement** : carte d'accès « Inclus dans votre offre », plus aucun prix d'entrée affiché ; bannière du tableau de bord adaptée quand l'offre donne accès à l'événement.
- **Prix** : l'euro est le montant principal, l'Ariary s'affiche en petit en dessous.
- **Accueil** : un membre d'entreprise ne choisit plus de secteur ; il reprend celui de son entreprise.

---

## 2026-10-07 — intégration Evolia, offres partenaires, rapport QA (module 19), nettoyage (module 17)

Tout ce qui suit est déployé en production.

### Ajouté

- **Paiement par carte bancaire et Mobile Money via Evolia**
  ([module 11](11_documentation_api_integration_evolia.md), v1.6).
  - **Paiement :** le gérant choisit « Carte bancaire » ou « Mobile Money » puis clique sur « Payer avec Evolia ». L'inscription est transmise à Evolia, et le gérant est redirigé vers leur page de paiement. Aucune preuve n'est demandée : Evolia confirme le paiement sur notre webhook, et l'accès s'ouvre automatiquement.
  - **Paiement interrompu :** un lien « Reprendre le paiement » reste affiché tant qu'Evolia n'a pas confirmé.
  - **Places supplémentaires :** le même parcours fonctionne pour l'achat de places supplémentaires.
- **Envois à Evolia.** Chaque envoi est signé (HMAC-SHA256) et inclut les dates de début et de fin de l'événement. Trois moments déclenchent un envoi :
  - le lancement d'un paiement par carte ou Mobile Money ;
  - la confirmation d'un virement ou d'un chèque par l'admin (envoi pour information) ;
  - la validation de la liste des participants par le gérant.
- **Section « Envois à Evolia » sur la fiche entreprise admin** : statut de chaque envoi, code de réponse, erreur éventuelle et bouton « Relancer ».
- **Liste des participants à l'événement validée par le gérant**
  ([module 18](18_rendez_vous_b2b_evenement.md) §4.9).
  - Le gérant coche, parmi les comptes de son entreprise, qui participe, lui-même compris, dans la limite des places de son offre.
  - Valider la liste inscrit les personnes cochées, désinscrit celles qui ont été retirées et transmet la liste à Evolia pour les badges.
- **Rattachement d'une offre à un événement** depuis le formulaire d'offre admin (« Événement donnant accès »). Le formulaire d'événement demande aussi désormais une **date et heure de fin**.
- **Offres partenaires institutionnels**
  ([module 20](20_offre_partenaire_institutionnel.md)).
  - L'admin invite le gérant avec son nom, son e-mail, l'offre partenaire et le nombre de collaborateurs (2 par défaut, modifiable).
  - Le gérant crée son mot de passe depuis l'e-mail, sans rien payer, puis invite ses collaborateurs comme une entreprise classique.
  - L'admin voit les partenaires en attente et ceux qui ont déjà créé leur compte.
- **Page « Mon profil »** ([module 19](19_rapport_qa_07_oct_2026.md) §3), avec des onglets adaptés au mobile.
- **Export comptable en euros, en CSV et en PDF** (module 19 §4.2).
  - L'euro est le prix officiel de l'offre, et le montant en Ariary est converti au taux enregistré lors du paiement.
  - Le CSV s'ouvre directement dans Excel en français, avec un en-tête lisible.
- **Catalogue de services dans le menu** (module 17 §3.3).
- **Sélecteurs secteur et pays** : les 10 valeurs les plus utilisées en premier, puis une recherche pour trouver les autres.
- Un composant commun pour tous les boutons d'ajout (opportunité, service…), qui ont désormais tous le même aspect.

### Modifié

- **Plus d'inscription automatique à l'événement.** Ni le paiement ni l'arrivée d'un collaborateur n'inscrivent plus personne d'office : seule la liste validée par le gérant inscrit. La case « Je participe » disparaît, remplacée par cette liste.
- **Accès ouvert dès la validation du paiement**, sans avoir à se déconnecter puis se reconnecter.
- **Le téléphone est obligatoire** quand on modifie son profil (module 19 §2).
- **Le badge est réservé aux offres à prix fixe** (module 19 §6.2).
- **Menu mobile du haut :** « Membres » apparaît juste après « Accueil » (module 19 §5.2).
- **Tableau de bord admin :** retrait de « Abonnements expirant bientôt » (module 19 §4.1).

### Corrigé

- Une seule icône « afficher le mot de passe » par champ (module 19 §1).
- Plus aucune page plus large que l'écran sur mobile ; le logo s'affiche sur la page de connexion mobile (module 19 §3.6, §5.1, §5.3).
- Sélecteur secteur/pays : la valeur trouvée par la recherche est bien appliquée.

### Retiré

Code mort repéré par [l'audit du module 17](17_audit_nettoyage_modules.md) :

- les crédits Deal Room ;
- le check-in par QR code ;
- le parcours de candidature et l'activation par lien ;
- les paliers Member, Executive et Chairman de l'interface ;
- le webhook Resend, ainsi que les dépendances et images SVG inutilisées.

### À faire

- **Evolia doit autoriser nos envois dans Cloudflare.** Leur pare-feu Cloudflare bloque pour l'instant nos envois (HTTP 403, page « Just a moment… »). Il faut une règle qui laisse passer le chemin `/integration/ceosummit/*`, ou notre serveur `57.128.183.148`. En attendant, le paiement par carte ou Mobile Money échoue proprement et le virement reste disponible.
- **Evolia doit dire quelle clé signe ses confirmations de paiement** : la même clé que nos envois, ou une autre. Si c'est la même, il faut la copier dans `PAYMENT_WEBHOOK_SECRET` sur le serveur.

---

## 2026-10-02 — correctifs de l'audit du 2 octobre (P0)

### Sécurité et accès

- Un admin désactivé ou suspendu n'a plus accès au back-office, et la gestion des comptes admin a désormais des garde-fous.
- Les fiches entreprise sont réservées aux membres qui ont payé. Seul le gérant d'une entreprise qui a payé peut déposer un service.
- La messagerie n'accepte plus d'opportunité rattachée depuis l'URL. Les messages de salle modérés sont retirés des réponses.
- Le seed est refusé en production. Le déploiement ne part plus que de `mvp-connect-simple`.
- Une limite de débit s'applique aux 8 routes d'envoi de fichiers.
- Carte et Mobile Money sont refusés aussi côté serveur, en attendant Evolia. Cette restriction est levée le 7 octobre.

### Corrigé

- La confirmation d'un paiement d'offre est faite en une seule opération : plus de paiement confirmé avec un accès resté fermé.
- Un double envoi du formulaire d'inscription ne provoque plus d'erreur 500.
- On peut se réinscrire à un évènement après avoir annulé.
- Finances : le revenu mensuel (MRR) et l'export comptable sont corrects.
- Temps réel : la connexion se rétablit après l'expiration du jeton.
- La photo de profil peut être envoyée avant la validation du paiement.
- Les pièces jointes des messages groupés (broadcast) fonctionnent sans stockage R2, et les échecs d'envoi sont signalés.
- Référentiel : impossible de supprimer une valeur encore utilisée.
- Plus de palier affiché sous le nom dans la barre latérale.

---

## 2026-10-01 — rapport QA client (module 16)

Correctifs du [rapport QA du 1er octobre](16_rapport_qa_1_octobre_2026.md).

### Ajouté

- **Le gérant peut modifier la fiche de son entreprise** (nouvel onglet « Modifier », §2.2), et **ajouter, modifier ou supprimer les services de son entreprise** (§2.5).
- **Messages groupés (broadcast)** : pièces jointes, et envoi à plusieurs offres à la fois (§3.2).
- **Aperçu des e-mails automatiques** dans l'admin (§3.3).

### Modifié

- L'euro est le montant principal sur tout l'écran de paiement (§1.3).
- Deal Room : mes opportunités d'abord, puis celles de mon secteur (§2.4).
- L'onglet « Gestion » devient « Gestion compte » (§2.1). La rubrique « Adhésions » est supprimée et les liens sont rendus cliquables (§1.4, §3.1).

### Corrigé

- Accord singulier/pluriel de « participant » (§1.2).

---

## 2026-09-30 — rapport QA client (module 15)

Correctifs et évolutions du [rapport de test QA du 30 septembre](15_rapport_qa_30_septembre_2026.md), implémentés et déployés le jour même.

### Ajouté

- **Icône afficher/masquer le mot de passe** sur les 4 champs mot de passe
  de la plateforme (connexion, création/réinitialisation, acceptation
  d'invitation, inscription entreprise) — aucun navigateur ne l'affiche
  plus nativement de façon fiable. Nouveau composant partagé
  `components/ui/password-input.tsx`.
- **Budget en € pour une opportunité Deal Room**, en plus de l'Ariary
  (nouveau champ `Opportunity.budgetEur`, informatif uniquement, jamais lu
  pour le filtre/tri).
- **Estimation Ariary au cours du jour** sur les prix affichés en euros
  (inscription, changement d'offre, achat de supplément) — jusqu'ici cette
  estimation était figée au moment où l'admin avait créé/modifié l'offre.
  Le montant réellement facturé/validé reste inchangé (toujours figé, pour
  ne pas casser la validation manuelle des preuves de paiement).
- **Tri de l'annuaire des membres par offre** (la plus chère en premier),
  nouveau par défaut — toujours modifiable via le sélecteur existant. La
  carte de l'offre actuellement la plus chère du catalogue se distingue
  visuellement (badge et bordure dorée).
- **Vrai logo CEO Summit** dans tous les emails transactionnels (jusqu'ici
  un simple texte).
- **Logo présent sur tous les écrans d'onboarding** (création d'entreprise,
  paiement) — il n'apparaissait auparavant que sur l'écran de bienvenue, les
  autres n'affichaient que le lien « Retour ».

### Modifié

- Sur les cartes d'offre, le **prix en euros est désormais la valeur
  principale** ; l'estimation Ariary passe en petit texte avec la mention
  « se référer au cours du jour » plutôt que noyée dans la même ligne.
- Retrait du sélecteur **« Membership minimum »** du formulaire de
  publication Deal Room — sans effet réel depuis une décision d'architecture
  antérieure (tout membre voit déjà toutes les opportunités), il ne servait
  plus qu'à induire en erreur.
- Textes reformulés : email de paiement rejeté, email d'invitation
  collaborateur, contact affiché sur la page « Accès en attente »
  (coordonnées réelles), texte d'explication de la preuve de paiement,
  « Cercle des Décideurs » sur l'écran de bienvenue.
- Tagline des sidebars admin/membre remplacée : « Conquérir de nouveaux
  possibles / The power to go beyond » (au lieu de « Océan Indien ·
  Décideurs »).

### Corrigé

- **Coquille "INDIA OCEAN" → "INDIAN OCEAN"** dans les deux fichiers logo
  (clair et sombre), présente depuis leur création — régénérés depuis la
  source fournie par le client, avec un recolorage en blanc pour la version
  destinée aux fonds sombres (illisible sinon sur fond navy). Les 17 écrans
  de démarrage iOS, générés depuis ce même fichier, sont régénérés en
  conséquence.
- **Timeout de déploiement CI/CD** — l'étape SSH de déploiement dépassait
  parfois le timeout par défaut (10 min) alors que le déploiement avait en
  réalité réussi (build et démarrage des conteneurs confirmés dans les
  logs), faisant remonter un échec en CI à tort. Porté à 20 min.
- **Data-root Docker sorti du contexte de build** — vivait dans le même
  dossier que le contexte de build Docker, provoquant des échecs
  intermittents ("can't stat .docker-data") quand le nettoyage disque en
  début de déploiement modifiait ce dossier pendant que le builder le
  parcourait. Migration automatique et idempotente ajoutée au workflow.

## 2026-09-25 — correctifs de l'audit MVP

### Sécurité

- **Optimiseur d'images désactivé** — Next.js 14.2.35 y a une faille
  d'exécution de code à distance sans authentification (GHSA-2xp9-vwfh-vxw4),
  et il acceptait les images de n'importe quel bucket Amazon S3. La montée
  vers Next ≥ 15.5.24 reste à planifier (1 critique, 5 élevées à `npm audit`).
- **Fichiers privés** (preuves de paiement, pièces Deal Room, pièces jointes
  de salles) : servis seulement au propriétaire, au gestionnaire concerné,
  aux membres ayant accès, ou à un admin — ils étaient lisibles par tout
  compte connecté tant que R2 n'est pas branché.
- **Limitation du nombre de tentatives** : ne se coupe plus quand Redis
  tombe (compteur mémoire de secours) ; limite par IP au login, à la
  candidature et au renvoi d'activation.
- **Comptes et sessions** : un compte suspendu perd l'accès tout de suite
  (messagerie, salles, uploads, gestion d'entreprise, temps réel), plus 24 h
  après ; une réinitialisation de mot de passe déconnecte les sessions
  ouvertes ; le login ne révèle plus l'existence ni le statut d'un compte.
- **Saisies** : liens `javascript:` refusés dans les sites web et réseaux
  sociaux, exports CSV protégés contre l'injection de formules, pièces
  jointes limitées aux fichiers de l'utilisateur, redirection après login
  verrouillée, conteneur Docker sans droits root, crédits attribuables
  seulement par le rôle Financier.
- **Webhooks** : vérification des notifications Resend au format réel
  (Svix) et protection optionnelle contre le rejeu des confirmations de
  paiement (en-tête `X-Webhook-Timestamp`).
- **Clé SSH de déploiement** sortie du dossier projet et exclue de git.

### Places, participants et suppléments

- À la validation du paiement, seuls les participants réels sont inscrits à
  l'évènement : le gestionnaire seulement s'il a coché « Je participe », et
  jamais au-delà du nombre de places payées. Cocher / décocher après coup
  inscrit / désinscrit le gestionnaire.
- Les invitations s'ouvrent une fois le paiement validé (plus d'invitations
  illimitées avant paiement sur les offres Groupement) ; le renvoi et
  l'acceptation revérifient le plafond ; la page et le serveur comptent les
  places de la même façon.
- Si l'email d'invitation n'a pas pu partir, le gestionnaire est prévenu.
- Suppléments : un seul en attente à la fois, affiché comme tel ;
  abonnement actif requis ; quantité plafonnée à 500 ; places
  supplémentaires remises à zéro au changement d'offre ; l'admin voit tous
  les paiements en attente.
- Le gestionnaire reçoit un email de bienvenue à l'inscription.
- Une offre supplément (ex. Executive Pass) n'apparaît plus jamais comme
  offre principale à l'inscription, ni via un lien `?offre=`, ni par appel
  direct au serveur ; les offres Groupement restent au catalogue.
- Seules les offres actives et en libre-service sont proposées en
  supplément (plus d'offre de sponsoring achetable par ce biais).

### Offres

- Une offre déjà souscrite ou achetée en supplément ne peut plus être
  supprimée : l'admin est invité à la désactiver, l'historique des
  paiements est conservé.
- Un prix en euros à 0 est converti côté serveur comme n'importe quel prix
  en euros ; les champs sans effet selon le mode (seuil en forfait, places
  en groupement) sont vidés à l'enregistrement.
- Les astérisques de mise en forme saisis dans un nom d'offre sont retirés
  (« Early Bird** … » en production) et le nom s'affiche proprement à
  l'inscription.

### Emails

- En production, un SMTP non configuré ne fait plus « disparaître »
  silencieusement les emails : l'échec est journalisé explicitement.
  Expéditeur par défaut aligné sur le compte SMTP si `EMAIL_FROM` est vide.
- L'invitation collaborateur précise que le lien est valable 7 jours et que
  l'invité choisit son mot de passe ; l'email d'activation ne parle plus
  d'un « paiement confirmé » (il suit l'acceptation d'une candidature).

### Documentation Evolia (v1.5)

- État réel du webhook de confirmation (en ligne, à relier aux paiements
  Evolia une fois l'échange 1 construit), codes `400`/`429` documentés,
  valeurs réelles de `paymentMethod`, montants toujours en Ariary, en-tête
  anti-rejeu optionnel.
- `conception/12` et `BACKLOG_MVP.md` mis à jour.

### Déploiement des correctifs et incident post-redémarrage

- Correctifs fusionnés et déployés en production le 25 septembre (`802f16f`
  → `224e505`) — confirmé : l'optimiseur d'images renvoie désormais 404 au
  lieu de servir des images arbitraires.
- **Healthcheck postgres corrigé** — `pg_isready` sans `-d` ciblait par
  défaut une base du même nom que l'utilisateur (`ceosummit`), inexistante
  (la vraie base est `ceo_summit`) ; sans conséquence sur le fonctionnement
  réel de postgres, mais faussait l'état lu par `depends_on`.
- **Incident isolé** : un redémarrage VPS (dépannage d'accès SSH, sans
  rapport avec le déploiement) a coupé postgres brutalement ; le temps de
  relecture des données (~24 min) a fait planter l'app en boucle (502)
  faute de base joignable, déjà documenté comme risque connu (`b756e14`).
  Résolu seul une fois postgres stabilisé, aucune perte de données.
- **Tarif Groupement confirmé le 25 septembre** par la grille officielle
  validée par le client : 720 €/pers (seuil 10), 550 €/pers (seuil 30) —
  conforme à la production, `conception/12` mis à jour en conséquence.
  Le même document précise aussi le cas Executive Pass (offre principale
  visible au catalogue, `isUpsell: false`, conforme à cette grille).

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
- **Page publique `/integration-evolia`** — documentation technique de
  l'intégration API accessible sans connexion, à donner directement en URL à
  l'équipe technique Evolia (reprend `conception/11`, tenue en phase avec).

### Modifié

- **Modèle de tarification des offres simplifié** à deux modes cohérents
  (Forfait à prix fixe / Groupement à prix par personne) — le mode
  `TIERED_GROUP` (paliers dégressifs), jamais utilisé par aucune offre
  active, a été retiré (schéma, UI admin, calculs). Voir module `12`.
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
