# SUIVI FRIGO

Application de relevé des températures de frigo et de traçabilité HACCP, multi-exploitations.
Installable sur téléphone, tablette et ordinateur (PWA). Supabase + Netlify.

---

## Ce que fait l'application

**Côté salarié**

- Connexion avec **code exploitation + identifiant + mot de passe** (aucun email nécessaire)
- Saisie du relevé : heure, température de chaque frigo, remarque et photo par frigo
- Enregistrement en brouillon puis validation
- Modification possible après validation — chaque modification est tracée et signalée à l'administrateur
- Rappels automatiques tant que le relevé du jour n'est pas fait

**Côté administrateur**

- Tableau de bord : relevé du jour, taux de conformité, dépassements, jours manquants
- Notification à chaque relevé validé, avec le récapitulatif complet
- Alerte immédiate dès qu'une température sort des seuils (notification + SMS)
- Alerte de fin de journée si aucun relevé n'a été fait
- Courbes de suivi par frigo avec zone de conformité
- Export Excel complet : relevés, synthèses, non-conformités, journal de traçabilité
- Gestion des frigos et de leurs seuils min/max
- Création et gestion des comptes salariés et administrateurs
- Création de plusieurs exploitations, chacune totalement cloisonnée

---

## Installation

### 1. Base de données Supabase

1. Ouvrez votre projet sur [supabase.com](https://supabase.com)
2. **SQL Editor ▸ New query** : collez tout le contenu de `supabase/schema.sql`, puis **Run**
3. **Authentication ▸ Providers ▸ Email** : désactivez *Confirm email*
   (les comptes sont créés par l'administrateur, aucun email n'est envoyé)
4. **Authentication ▸ Users ▸ Add user ▸ Create new user**
   - Email : `gerant.siege@suivifrigo.app`
   - Mot de passe : celui de votre choix
   - Cochez **Auto Confirm User**
5. **SQL Editor** : exécutez `supabase/bootstrap.sql`

Vous pouvez maintenant vous connecter avec : exploitation `siege`, identifiant `gerant`.

> Le format de l'adresse est imposé : `<identifiant>.<code_exploitation>@suivifrigo.app`.
> Aucun message n'est jamais envoyé à cette adresse, elle sert uniquement de clé interne.

### 2. Clés de notification

```bash
npm install
npm run vapid
```

Copiez les quatre lignes affichées dans votre `.env` puis, plus tard, dans Netlify.
**Ne régénérez jamais ces clés une fois en production** : tous les appareils déjà
abonnés cesseraient de recevoir les notifications.

### 3. Développement local

```bash
cp .env.example .env      # puis remplissez les valeurs
npm install
npm run dev
```

> Les notifications push et les fonctions serveur ne fonctionnent pas avec `npm run dev` seul.
> Pour les tester en local : `npm i -g netlify-cli` puis `netlify dev`.

### 4. Mise en ligne sur Netlify

1. Poussez le projet sur GitHub
2. Netlify ▸ **Add new site ▸ Import an existing project** ▸ choisissez le dépôt
3. Les réglages de build sont déjà dans `netlify.toml` — ne changez rien
4. **Site settings ▸ Environment variables** : ajoutez toutes les variables de `.env.example`
   (sauf `.env` lui-même)
5. **Deploy**

Vérifiez ensuite dans **Functions** que `cron-notifications` apparaît bien comme
fonction planifiée (toutes les 30 minutes).

---

## Variables d'environnement

| Variable | Où la trouver | Secrète |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase ▸ Project Settings ▸ API | non |
| `VITE_SUPABASE_ANON_KEY` | Supabase ▸ Project Settings ▸ API | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase ▸ Project Settings ▸ API | **oui** |
| `VITE_VAPID_PUBLIC_KEY` | `npm run vapid` | non |
| `VAPID_PUBLIC_KEY` | identique à la précédente | non |
| `VAPID_PRIVATE_KEY` | `npm run vapid` | **oui** |
| `VAPID_SUBJECT` | `mailto:votre@email.fr` | non |
| `CRON_SECRET` | chaîne aléatoire de votre choix | **oui** |
| `TWILIO_ACCOUNT_SID` | console Twilio — facultatif | **oui** |
| `TWILIO_AUTH_TOKEN` | console Twilio — facultatif | **oui** |
| `TWILIO_FROM` | numéro Twilio — facultatif | non |

Sans les variables Twilio, l'application fonctionne normalement : seules les
notifications push sont envoyées, les SMS sont ignorés silencieusement.

---

## Installer l'application sur un appareil

| Appareil | Marche à suivre |
|---|---|
| **iPhone / iPad** | Safari ▸ bouton Partager ▸ « Sur l'écran d'accueil ». **Obligatoire** pour recevoir les notifications (iOS 16.4+). |
| **Android** | Chrome ▸ menu ⋮ ▸ « Installer l'application » |
| **Ordinateur** | Icône d'installation dans la barre d'adresse (Chrome, Edge) |

Chaque personne doit ensuite activer les notifications dans **Réglages ▸ Notifications**,
sur chaque appareil qu'elle utilise.

---

## Architecture

```
src/
  pages/           écrans (connexion, relevé, historique, administration)
  components/      mise en page, icônes, éléments d'interface
  context/         session et profil connecté
  lib/             Supabase, notifications, photos, export Excel, palette
  sw.js            service worker : hors ligne + réception des notifications
netlify/functions/
  admin-users      création et gestion des comptes (clé service_role)
  admin-fermes     création et suppression des exploitations
  notify-releve    récapitulatif administrateur, alertes de dépassement, SMS
  cron-notifications  rappels et alerte de relevé manquant (toutes les 30 min)
supabase/
  schema.sql       tables, déclencheurs, vues, sécurité par ligne (RLS)
  bootstrap.sql    création du tout premier compte
```

### Sécurité

- **Cloisonnement par exploitation** appliqué au niveau de la base (Row Level Security) :
  même en manipulant les requêtes, un compte ne peut lire ni écrire les données d'une
  autre exploitation.
- Un salarié ne peut pas se promouvoir administrateur ni changer d'exploitation
  (déclencheur `protect_profile_fields`).
- Un salarié ne peut pas supprimer de relevé.
- La clé `service_role` n'existe que côté serveur, jamais dans le navigateur.
- Les photos sont dans un bucket privé, accessibles uniquement par liens signés temporaires.

### Traçabilité

- Les seuils min/max sont **figés dans chaque mesure** au moment du relevé : modifier
  les seuils d'un frigo ne réécrit jamais l'historique.
- Le nom de l'auteur est **figé dans chaque relevé** : supprimer un compte n'efface
  aucune trace réglementaire.
- Toute création, validation et modification est horodatée dans `releve_historique`.

---

## Fonctionnement des notifications

| Moment | Destinataires | Condition |
|---|---|---|
| 1ᵉʳ rappel (08:00 par défaut) | salariés | aucun relevé validé ce jour |
| 2ᵉ rappel (13:30 par défaut) | salariés | aucun relevé validé ce jour |
| Alerte relevé manquant (18:00 par défaut) | administrateurs | aucun relevé validé ce jour |
| Récapitulatif | administrateurs | à chaque relevé validé |
| Signalement de modification | administrateurs | relevé modifié après validation |
| Alerte température | **tous** les comptes + SMS | mesure hors seuils |

Les horaires se règlent par exploitation dans **Gestion ▸ Exploitation**, par tranches
de 30 minutes. Ils sont interprétés en heure locale : le passage à l'heure d'été ou
d'hiver n'a aucun effet.

---

## Dépannage

**« Code ferme, identifiant ou mot de passe incorrect »**
Vérifiez que *Confirm email* est bien désactivé dans Supabase et que le compte a été
créé depuis l'application (ou avec l'adresse au bon format).

**Aucune notification sur iPhone**
L'application doit avoir été ajoutée à l'écran d'accueil et ouverte **depuis cette icône**.
Dans Safari lui-même, iOS ne délivre aucune notification.

**Les notifications ne partent plus du tout**
Vérifiez que `VAPID_PRIVATE_KEY` et `VAPID_PUBLIC_KEY` correspondent bien à la paire
utilisée par `VITE_VAPID_PUBLIC_KEY`, et que le site a été redéployé après leur ajout.

**Erreur de politique sur `storage.objects`**
Si Supabase refuse la création des politiques de stockage depuis l'éditeur SQL,
créez-les depuis **Storage ▸ Policies** sur le bucket `photos-releves` en reprenant
les conditions de la section 6 de `schema.sql`.

**Tester la tâche planifiée manuellement**

```bash
curl -X POST "https://votre-site.netlify.app/.netlify/functions/cron-notifications?key=VOTRE_CRON_SECRET"
```

---

## Licence

Projet livré à Vivien Caron pour un usage libre.
