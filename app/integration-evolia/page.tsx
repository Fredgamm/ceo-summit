import type { Metadata } from "next";
import type { ReactNode } from "react";

import { appUrl } from "@/lib/app-url";

export const metadata: Metadata = { title: "Intégration API — Evolia" };

/**
 * 22 septembre 2026 — version publique, accessible sans connexion (voir
 * middleware.ts), de `conception/11_documentation_api_integration_evolia.md`
 * (dépôt de conception) — à donner directement à l'équipe technique Evolia
 * comme URL plutôt qu'un fichier à leur envoyer. Contenu tenu en phase avec
 * ce document source ; toute modification doit être répercutée des deux
 * côtés.
 */
// 14 oct. 2026 — rendue à la demande : les adresses affichées sont celles
// de l'instance consultée (prod ou préprod), pas celles de la compilation.
export const dynamic = "force-dynamic";

export default function EvoliaIntegrationPage() {
  const baseUrl = appUrl();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        CEO Summit — Documentation technique
      </p>
      <h1 className="mb-3 text-2xl font-bold text-navy">Intégration API — CEO Summit × Evolia</h1>
      <p className="mb-8 text-sm text-text-muted">
        Version 1.6 — révisée le 8 octobre 2026. Remplace tout échange ou document antérieur
        (spécifications envoyées par email, export PDF/HTML) — c&apos;est cette page qui fait foi.
      </p>

      <div className="flex flex-col gap-10 text-sm leading-relaxed text-text-mid">
        <Section title="1. Vue d'ensemble">
          <p>
            <strong className="text-navy">
              Le principe : c&apos;est CEO Summit qui vous envoie les données, vous n&apos;avez rien
              à interroger ni à récupérer chez nous.
            </strong>{" "}
            Deux appels <strong className="text-navy">HTTPS</strong> (jamais de HTTP en clair — voir
            la note sécurité ci-dessous), chacun dans un sens. Pour un paiement par carte bancaire
            ou Mobile Money, le gestionnaire est en outre redirigé vers votre page de paiement,{" "}
            <code>https://event.aiolia.us/ceosummit/payment/{"{ceoSummitReference}"}</code> (voir
            §3) :
          </p>
          <ol className="list-decimal pl-5">
            <li>
              Un utilisateur choisit une offre payante sur CEO Summit →{" "}
              <strong className="text-navy">CEO Summit vous pousse l&apos;inscription</strong> (
              <code>POST</code> vers votre endpoint, signé en HMAC-SHA256 — voir §3).
            </li>
            <li>Vous encaissez ce paiement de votre côté, par le moyen de votre choix.</li>
            <li>
              Une fois encaissé,{" "}
              <strong className="text-navy">vous confirmez auprès de CEO Summit</strong> en appelant
              notre webhook, déjà construit et testable dès aujourd&apos;hui, indépendamment de
              l&apos;avancement du point 1 (voir §2).
            </li>
          </ol>

          <Table
            head={["#", "Sens", "Objet", "Statut"]}
            rows={[
              [
                "1",
                "CEO Summit → Evolia",
                "Push d'inscription (entreprise + offre + participants)",
                "Endpoint et secret reçus le 8 octobre 2026 — voir §3",
              ],
              [
                "2",
                "Evolia → CEO Summit",
                "Confirmation de paiement",
                "✅ Route en ligne, signature vérifiée — reliée aux paiements carte / Mobile Money lancés par l'échange 1 (§2)",
              ],
            ]}
          />

          <Callout>
            <strong>Sécurité du transport.</strong> Les deux échanges se font exclusivement en{" "}
            <strong>HTTPS (TLS)</strong>, jamais en HTTP en clair — non négociable des deux côtés,
            données d&apos;entreprises et de participants en jeu. En plus du chiffrement du
            transport, l&apos;échange 2 (notre webhook, §2) exige une{" "}
            <strong>signature HMAC-SHA256</strong> sur chaque requête pour garantir que l&apos;appel
            vient bien de vous — voir le détail en §2. Réciproquement, chaque appel de
            l&apos;échange 1 (§3) est signé en HMAC-SHA256 avec le secret que vous nous avez fourni
            (<code>WEBHOOK_SECRET</code>) — voir §3, « Endpoint et authentification ».
          </Callout>

          <Callout>
            <strong>Le virement bancaire ne passe pas par Evolia.</strong> CEO Summit propose deux
            moyens de paiement en parallèle : le paiement via Evolia (échanges 1 et 2), et le
            virement bancaire, dont la preuve est validée directement et manuellement par un
            administrateur CEO Summit — sans appel à Evolia, ni entrant ni sortant. Seule exception
            : le push d&apos;inscription (§3) s&apos;envoie dans les deux cas, puisque vous avez
            besoin de connaître tout participant qui obtient l&apos;accès, quel que soit son mode de
            paiement.
          </Callout>
        </Section>

        <Section title="2. Échange 2 — Webhook de confirmation de paiement (Evolia → CEO Summit)">
          <p>
            <strong className="text-navy">La route est en ligne côté CEO Summit</strong> (route
            générique, conçue pour n&apos;importe quel prestataire de paiement externe) : elle
            vérifie la signature, valide le corps de la requête et confirme le paiement référencé.
            Ce webhook ne concerne que les paiements initiés et traités par vous (§3) — un paiement
            par virement bancaire suit un chemin entièrement séparé, validé manuellement par un
            administrateur CEO Summit.
          </p>

          <Callout>
            <strong>Références réelles :</strong> chaque paiement carte / Mobile Money lancé sur CEO
            Summit crée la <code>reference</code> (<code>ceoSummitReference</code> du push, §3) que
            ce webhook attend. Pour tester votre calcul de signature : un appel correctement signé
            portant une référence inconnue renvoie <code>409</code> (et non <code>401</code>).
          </Callout>

          <SubHeading>Requête attendue</SubHeading>
          <Json>{`POST ${baseUrl}/api/webhooks/payments
Content-Type: application/json
X-Webhook-Signature: sha256=<signature hex>
X-Webhook-Timestamp: <secondes Unix>   (optionnel — voir « Anti-rejeu »)`}</Json>

          <SubHeading>Corps de la requête</SubHeading>
          <Json>{`{
  "event": "payment.confirmed",
  "type": "company_payment",
  "reference": "cmp_9f2ab3d8e1",
  "amount": 2500000
}`}</Json>

          <Table
            head={["Champ", "Type", "Requis", "Description"]}
            rows={[
              ["event", `"payment.confirmed" | "payment.failed"`, "oui", "Résultat du paiement."],
              [
                "type",
                `"company_payment"`,
                "oui",
                "Toujours cette valeur pour un paiement d'offre entreprise.",
              ],
              [
                "reference",
                "string",
                "oui",
                "L'identifiant que CEO Summit vous aura transmis dans le push d'inscription (§3, champ ceoSummitReference) — à renvoyer strictement tel quel.",
              ],
              [
                "amount",
                "number",
                "non",
                "Montant confirmé, en Ariary. Informatif — CEO Summit ne recalcule rien à partir de ce champ.",
              ],
            ]}
          />

          <SubHeading>Authentification — HMAC-SHA256</SubHeading>
          <ul className="list-disc pl-5">
            <li>
              Secret partagé, à échanger hors bande (jamais dans le payload ni dans l&apos;URL).
            </li>
            <li>
              Signature calculée sur le <strong>corps brut</strong> de la requête (la chaîne JSON
              exacte envoyée, pas une reconstruction) : <code>HMAC-SHA256(corps_brut, secret)</code>
              , encodée en hexadécimal.
            </li>
            <li>
              Transmise dans l&apos;en-tête <code>X-Webhook-Signature</code>, avec ou sans préfixe{" "}
              <code>sha256=</code> (les deux formes sont acceptées).
            </li>
            <li>
              Toute requête sans signature valide est rejetée en <code>401</code>, avant tout
              traitement.
            </li>
          </ul>

          <SubHeading>Anti-rejeu — en-tête optionnel X-Webhook-Timestamp</SubHeading>
          <p>
            Recommandé, mais facultatif et rétro-compatible (ajouté le 25 septembre 2026). Sans cet
            en-tête, rien ne change. Avec (<code>X-Webhook-Timestamp: 1790000000</code>, horodatage
            en secondes Unix, UTC), la signature porte sur la chaîne{" "}
            <code>&lt;timestamp&gt;.&lt;corps_brut&gt;</code> —{" "}
            <code>HMAC-SHA256(&quot;&lt;timestamp&gt;.&lt;corps_brut&gt;&quot;, secret)</code>,
            toujours en hexadécimal dans <code>X-Webhook-Signature</code> — et toute requête dont
            l&apos;horodatage s&apos;écarte de plus de <strong>5 minutes</strong> de l&apos;heure du
            serveur CEO Summit est rejetée en <code>401</code>.
          </p>

          <SubHeading>Réponses</SubHeading>
          <Table
            head={["Code", "Signification"]}
            rows={[
              ["200", `Paiement traité — {"data":{"received":true}}`],
              ["400", "Corps de requête qui n'est pas du JSON valide"],
              [
                "401",
                "Signature invalide ou absente (ou X-Webhook-Timestamp invalide / de plus de 5 minutes)",
              ],
              ["409", "reference introuvable, ou paiement déjà confirmé/traité (idempotence)"],
              ["422", "JSON valide mais contenu invalide (champ manquant/mal typé)"],
              [
                "429",
                "Trop de requêtes — limite de 60 requêtes par minute et par adresse IP ; réessayer après une courte attente",
              ],
              ["500", "Erreur interne CEO Summit"],
            ]}
          />

          <p>
            <strong className="text-navy">Idempotence :</strong> un même <code>reference</code> ne
            peut être confirmé qu&apos;une seule fois. Un retry sur un paiement déjà confirmé
            renvoie <code>409</code>, sans effet de bord — vous pouvez réessayer sans risque en cas
            de doute sur la réception d&apos;un <code>200</code>.
          </p>
        </Section>

        <Section title="3. Échange 1 — Push d'inscription (CEO Summit → Evolia)">
          <p>
            CEO Summit inscrit l&apos;entreprise qui a choisi une offre sur sa propre interface,
            puis pousse ces informations vers vous en un seul appel. Pour un paiement par{" "}
            <strong className="text-navy">carte bancaire ou Mobile Money</strong>, le gestionnaire
            est ensuite <strong className="text-navy">redirigé vers votre page de paiement</strong>{" "}
            :
          </p>
          <Json>{`https://event.aiolia.us/ceosummit/payment/{ceoSummitReference}`}</Json>
          <p>
            Vous encaissez le paiement et confirmez via le webhook de l&apos;échange 2 (§2) une fois
            le paiement reçu. Tant que cette confirmation n&apos;est pas arrivée, l&apos;espace CEO
            Summit du gestionnaire lui propose un lien « Reprendre le paiement » vers la même page
            (paiement interrompu, onglet fermé…) : la page doit donc rester utilisable pour une même{" "}
            <code>ceoSummitReference</code> tant qu&apos;elle n&apos;a pas été payée.
          </p>

          <p>
            <strong className="text-navy">Retour vers CEO Summit après paiement :</strong> une fois
            le paiement finalisé sur votre page, redirigez le gestionnaire vers :
          </p>
          <Json>{`${baseUrl}/entreprise/paiement/confirmation?ref={ceoSummitReference}`}</Json>
          <p>
            Cette page attend que votre confirmation (§2) soit enregistrée, quelques secondes au
            plus, puis ouvre l&apos;espace du gestionnaire sur la désignation des participants à
            l&apos;événement. Elle fonctionne même si la redirection précède votre webhook. Cette
            redirection ne remplace pas le webhook : c&apos;est lui seul qui active l&apos;accès.
          </p>

          <SubHeading>Endpoint et authentification</SubHeading>
          <ul className="list-disc pl-5">
            <li>
              <strong>URL :</strong>{" "}
              <code>POST https://api-event.aiolia.us/integration/ceosummit/registrations</code>
            </li>
            <li>
              <strong>Corps :</strong> JSON (<code>Content-Type: application/json</code>), un des
              payloads ci-dessous.
            </li>
            <li>
              <strong>Signature :</strong> en-tête{" "}
              <code>X-Webhook-Signature: sha256=&lt;hex&gt;</code>, où <code>&lt;hex&gt;</code> est
              le HMAC-SHA256 du <strong>corps brut</strong> de la requête avec votre{" "}
              <code>WEBHOOK_SECRET</code> — même schéma que notre propre webhook (§2). Comparez en
              temps constant.
            </li>
            <li>
              <strong>Réponse attendue :</strong> tout code <code>2xx</code> vaut réception. Tout
              autre code (ou absence de réponse sous 10 secondes) est journalisé en échec côté CEO
              Summit et peut être renvoyé à l&apos;identique par un administrateur ; un même payload
              peut donc vous parvenir plus d&apos;une fois.
            </li>
            <li>
              <strong>Paiement carte / Mobile Money :</strong> si l&apos;appel échoue, CEO Summit ne
              redirige pas le gestionnaire (rien ne pourrait être encaissé) : le paiement est annulé
              de notre côté et il lui est proposé de réessayer ou de régler par virement.
            </li>
          </ul>

          <SubHeading>Déclencheurs</SubHeading>
          <p>Cet appel est envoyé à trois moments distincts, avec le même format :</p>
          <ol className="list-decimal pl-5">
            <li>
              <strong className="text-navy">Inscription initiale</strong> — l&apos;entreprise vient
              d&apos;être créée avec un seul participant, le gestionnaire, qui a choisi une offre à
              payer via Evolia. Envoyé <strong>avant</strong> toute confirmation de paiement.
              Important : le gestionnaire n&apos;est pas automatiquement un participant à
              l&apos;événement — souvent juste la personne qui inscrit l&apos;entreprise et paie
              (ex. une secrétaire). Ne générez rien (badge, QR) à partir de ce seul push.
            </li>
            <li>
              <strong className="text-navy">Validation de la liste des participants</strong> — plus
              tard, parfois plusieurs jours après le paiement, à sa prochaine connexion, le
              gestionnaire coche depuis son espace, parmi les comptes de son entreprise, les
              personnes qui assisteront à l&apos;évènement (lui-même compris s&apos;il y assiste),
              dans la limite des places de son offre, puis valide la liste.{" "}
              <strong>C&apos;est ce déclencheur, pas le premier, qui fait foi</strong> pour générer
              les accès et badges/QR — chaque validation envoie un nouvel appel avec la liste à
              jour.
            </li>
            <li>
              <strong className="text-navy">Ajout de participants au-delà du quota inclus</strong> —
              si l&apos;offre payée inclut un nombre limité de participants et que le gestionnaire
              veut en ajouter davantage, la plateforme lui propose un supplément payant. Une fois ce
              paiement additionnel validé (via Evolia ou virement), un{" "}
              <code>company.participants.confirmed</code> repart avec la capacité totale mise à jour
              si la liste avait déjà été validée, puis à chaque nouvelle validation de la liste par
              le gestionnaire.
            </li>
          </ol>
          <p>
            Ce push s&apos;envoie aussi pour une entreprise qui règle par virement bancaire — dans
            ce cas il part au moment de la validation manuelle du virement par l&apos;admin CEO
            Summit, et sert seulement à vous faire connaître le participant.
          </p>

          <SubHeading>Proposition de payload</SubHeading>
          <p>
            Même structure aux trois déclencheurs, mais deux valeurs distinctes du champ{" "}
            <code>event</code> — c&apos;est ce champ, pas la présence d&apos;un nom, qui indique si
            la liste est prête pour la génération de badges :
          </p>
          <Table
            head={["Valeur de event", "Sens", "Badge/QR à générer ?"]}
            rows={[
              [
                "company.registration.pushed",
                "Inscription (et paiement, initial ou supplément) en cours — participants n'est pas encore la liste confirmée.",
                "Non.",
              ],
              [
                "company.participants.confirmed",
                "Le gestionnaire a validé la liste réelle des participants depuis son espace.",
                "Oui — seul déclencheur à considérer pour ça.",
              ],
            ]}
          />

          <SubHeading>1. Inscription initiale</SubHeading>
          <p>Le gestionnaire qui paie, pas encore un participant confirmé :</p>
          <Json>{`{
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
  "participants": [
    { "fullName": "Fanja Rakoto", "email": "fanja@exemple.mg", "isInitiator": true }
  ]
}`}</Json>

          <SubHeading>2. Validation de la liste des participants</SubHeading>
          <p>
            Quelques jours plus tard, le gestionnaire choisit qui assiste réellement (ici, lui-même
            et un collaborateur) :
          </p>
          <Json>{`{
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
}`}</Json>

          <SubHeading>3. Ajout de participants au-delà du quota inclus</SubHeading>
          <p>
            L&apos;offre n&apos;incluait que 2 participants, le gestionnaire en ajoute un 3ᵉ : un{" "}
            <code>company.registration.pushed</code> part d&apos;abord pour le supplément, puis un{" "}
            <code>company.participants.confirmed</code> suit dès que ce paiement est validé. Le
            tarif du supplément <strong>n&apos;est pas une valeur fixe codée en dur</strong> —
            c&apos;est le prix d&apos;une offre configurée par l&apos;admin CEO Summit comme
            n&apos;importe quelle autre (ex. un pass à l&apos;unité, ou une offre groupée par lot de
            places), donc <code>amountDue</code> reflète le prix réel de l&apos;offre supplément
            choisie, multiplié par la quantité achetée — toujours en Ariary.{" "}
            <code>participants</code> y reprend la liste confirmée à cet instant ; la personne
            ajoutée y entrera quand le gestionnaire validera de nouveau sa liste, une fois la place
            payée :
          </p>
          <Json>{`{
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
}`}</Json>

          <Table
            head={["Champ", "Description"]}
            rows={[
              [
                "ceoSummitReference",
                "À renvoyer strictement tel quel dans le webhook de confirmation (§2, champ reference).",
              ],
              [
                "paymentMethod",
                `"evolia" (carte bancaire ou Mobile Money, à encaisser par vos soins) ou "virement" (virement ou chèque, déjà réglé et validé manuellement côté CEO Summit — push informatif). Absent sur company.participants.confirmed.`,
              ],
              [
                "eventDetails",
                'Événement auquel l\'offre donne accès : startsAt et endsAt (début et fin, date et heure) en ISO 8601 avec le décalage de Madagascar (+03:00), timezone toujours "Indian/Antananarivo", location ("En ligne" pour un événement en ligne). null si l\'offre ne donne accès à aucun événement.',
              ],
              [
                "amountDue",
                'Montant à encaisser pour ce push précisément (pas un cumulatif), toujours en Ariary (currency = "MGA") : CEO Summit ne stocke les montants dus qu\'en Ariary, une offre affichée en euros étant convertie au taux du jour lors de sa configuration. Absent sur company.participants.confirmed et sur paymentMethod VIREMENT/CHEQUE.',
              ],
            ]}
          />

          <p>
            Chaque appel transmet un <strong className="text-navy">instantané complet</strong> de
            l&apos;entreprise à cet instant (pas un delta) — l&apos;entreprise en entité racine, la
            liste intégrale et à jour de ses participants confirmés.
          </p>

          <p>Règles communes aux deux valeurs de event, alignées sur vos contrôles :</p>
          <ul className="list-disc pl-5">
            <li>
              <code>ceoSummitReference</code> est présent sur chaque appel ; sur
              company.participants.confirmed, c&apos;est la référence du paiement de l&apos;offre,
              déjà transmise avec l&apos;inscription.
            </li>
            <li>
              <code>participants</code> n&apos;est jamais vide : pour un supplément acheté avant la
              validation de la liste, il contient le gestionnaire.
            </li>
            <li>
              Une liste de participants n&apos;est envoyée qu&apos;une fois l&apos;abonnement actif,
              donc après l&apos;encaissement.
            </li>
            <li>
              Offre sans paiement (partenaire institutionnel intégré par CEO Summit) : avant sa
              première liste, un company.registration.pushed part avec{" "}
              <code>paymentMethod: &quot;virement&quot;</code>, sans montant, et pour référence
              l&apos;identifiant de son abonnement.
            </li>
          </ul>

          <Callout>
            <strong>Ne pas générer de badge à partir d&apos;un company.registration.pushed.</strong>{" "}
            Le gestionnaire qui inscrit l&apos;entreprise et paie n&apos;est pas forcément
            quelqu&apos;un qui assistera à l&apos;évènement. Générez badges/QR uniquement à
            réception d&apos;un <code>company.participants.confirmed</code>.
          </Callout>

          <Callout>
            <strong>La liste de participants se remplit dans le temps.</strong>{" "}
            <code>includedParticipants</code> (nombre de sièges de l&apos;offre) ne veut pas dire
            que <code>participants</code> en contient déjà autant à l&apos;inscription initiale. Le
            premier appel ne contient donc que le gestionnaire (exemple 1), la liste confirmée
            arrive séparément (exemple 2), et peut encore grandir plus tard moyennant un paiement
            complémentaire (exemple 3). Ce n&apos;est pas une anomalie à signaler de votre côté.
          </Callout>

          <Callout>
            <strong>Nom en un seul champ.</strong> Côté CEO Summit, l&apos;identité d&apos;un
            utilisateur est stockée comme un nom complet unique (<code>fullName</code>), jamais
            séparé en prénom/nom. Si votre encaissement ou vos badges nécessitent prénom et nom
            distincts, merci de le signaler.
          </Callout>

          <Callout>
            <strong>
              includedParticipants ne veut pas dire la même chose selon le déclencheur.
            </strong>{" "}
            Sur <code>company.registration.pushed</code> (déclencheurs 1 et 3), c&apos;est le nombre
            de places de la transaction en cours — ne s&apos;additionne pas d&apos;un push à
            l&apos;autre. Sur <code>company.participants.confirmed</code>, c&apos;est la{" "}
            <strong>capacité totale actuelle</strong> de l&apos;abonnement (offre initiale plus tout
            supplément déjà validé), recalculée à chaque appel — c&apos;est ce nombre-là qui fait
            foi. N&apos;additionnez pas vous-même plusieurs <code>company.registration.pushed</code>{" "}
            pour reconstituer un total : le prochain <code>company.participants.confirmed</code>{" "}
            vous le donnera déjà calculé.
          </Callout>

          <Callout>
            <strong>Qui apparaît dans participants sur company.participants.confirmed.</strong> Le
            gestionnaire qui a inscrit l&apos;entreprise (<code>isInitiator: true</code>)
            n&apos;apparaît dans cette liste{" "}
            <strong>que s&apos;il s&apos;est lui-même coché comme participant</strong> en validant
            la liste depuis son espace CEO Summit — sinon il reste un compte administratif pur,
            jamais un participant, même après validation de la liste par ses soins. Un gestionnaire
            peut inviter 5 collaborateurs sans jamais se déclarer participant lui-même, auquel cas{" "}
            <code>participants</code> n&apos;en contiendra que 5, sans{" "}
            <code>isInitiator: true</code>. Tous les participants sont poussés sous le même{" "}
            <code>companyId</code>/nom d&apos;entreprise à chaque appel, quel que soit le moment où
            ils ont été ajoutés.
          </Callout>

          <SubHeading>Ce dont nous avons besoin de votre part</SubHeading>
          <ol className="list-decimal pl-5">
            <li>
              <s>URL et méthode de votre endpoint, et authentification attendue de notre part</s> —{" "}
              <strong className="text-navy">reçus le 8 octobre 2026</strong> (voir « Endpoint et
              authentification »).
              <ul className="list-disc pl-5">
                <li>
                  <strong className="text-navy">Reste à confirmer :</strong> vos confirmations de
                  paiement (§2) sont-elles signées avec le même <code>WEBHOOK_SECRET</code>, ou avec
                  un secret distinct ?
                </li>
              </ul>
            </li>
            <li>
              Confirmation que <code>ceoSummitReference</code> soit bien porté tel quel jusqu&apos;à
              votre webhook de confirmation (§2, champ <code>reference</code>).
            </li>
            <li>
              Cas d&apos;échec/annulation : un événement <code>payment.failed</code> séparé, ou un
              comportement différent ?
            </li>
            <li>Confirmation qu&apos;un instantané complet à chaque appel convient.</li>
            <li>
              Confirmation que <code>companyId</code> suffit à rattacher l&apos;envoi à la bonne
              entreprise de votre côté.
            </li>
            <li>
              <code>fullName</code> unique, ou prénom/nom séparés requis de votre côté ?
            </li>
            <li>
              Confirmation que la génération de badge/QR n&apos;a bien lieu que sur{" "}
              <code>company.participants.confirmed</code>.
            </li>
            <li>
              <strong className="text-navy">Accès à un environnement sandbox</strong> pour tester
              cet échange avant mise en production.
            </li>
          </ol>
        </Section>

        <Section title="Contact">
          <p>
            Pour toute question sur cette documentation, ou pour nous transmettre les réponses
            ci-dessus, contactez l&apos;équipe technique CEO Summit via vos interlocuteurs
            habituels.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 text-sm font-bold text-navy">{children}</h3>;
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-gold-light bg-gold-pale px-4 py-3 text-sm text-navy">
      {children}
    </div>
  );
}

function Json({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-navy-dark px-4 py-3 text-xs leading-relaxed text-white">
      <code>{children}</code>
    </pre>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-surface">
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-border px-3 py-2 text-left font-bold text-navy"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top text-text-mid">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
