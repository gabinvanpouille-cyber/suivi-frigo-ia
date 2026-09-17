/* Tâche planifiée (toutes les 30 minutes, voir netlify.toml).
 *
 * Pour chaque exploitation active :
 *   - à l'heure du 1ᵉʳ et du 2ᵉ rappel, prévient les salariés si aucun relevé
 *     n'a encore été validé dans la journée ;
 *   - à l'heure d'alerte, prévient les administrateurs si la journée est
 *     toujours sans relevé.
 *
 * L'heure est calculée dans le fuseau de chaque ferme : le passage à
 * l'heure d'été ou d'hiver n'a aucun effet sur les horaires. */
import { clientAdmin, heureLocale, dateLocale, json } from './lib/commun.js'
import { envoyerPush, envoyerSms, journaliser, destinataires } from './lib/notifs.js'

/** Arrondit « HH:MM » au créneau de 30 minutes en cours. */
function creneau(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${m >= 30 ? '30' : '00'}`
}

/** Jour de la semaine local (0 = dimanche … 6 = samedi) dans le fuseau donné. */
function jourSemaine(tz) {
  const abrev = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date())
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[abrev]
}

/** Évite un double envoi si la tâche est rejouée dans la même journée. */
async function dejaEnvoye(admin, fermeId, type, titre) {
  const limite = new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('ferme_id', fermeId)
    .eq('type', type)
    .eq('titre', titre)
    .gte('created_at', limite)
  return (count ?? 0) > 0
}

export default async (request) => {
  /* Protection : on accepte la planification Netlify (en-tête « x-nf-event »
     ou corps « next_run » envoyé par l'ordonnanceur) et les appels manuels
     signés par CRON_SECRET. Tout le reste est refusé. */
  const secret = process.env.CRON_SECRET
  const cleFournie =
    new URL(request.url).searchParams.get('key') || request.headers.get('x-cron-key')

  let corpsPlanificateur = false
  try {
    const brut = await request.text()
    corpsPlanificateur = brut ? 'next_run' in JSON.parse(brut) : false
  } catch { /* corps absent ou non JSON */ }

  const autorise =
    request.headers.get('x-nf-event') === 'schedule' ||
    corpsPlanificateur ||
    (secret && cleFournie === secret)

  if (!autorise) return new Response('Non autorisé', { status: 401 })

  const admin = clientAdmin()
  const journal = []

  /* Référentiel des produits, chargé une fois pour toutes les exploitations. */
  const { data: produits } = await admin
    .from('produits')
    .select('code, libelle, ordre')
    .order('ordre')
  const libelleProduit = (code) =>
    (produits ?? []).find((p) => p.code === code)?.libelle ?? code
  const rangProduit = (code) => {
    const i = (produits ?? []).findIndex((p) => p.code === code)
    return i === -1 ? 99 : i
  }

  const { data: fermes, error } = await admin
    .from('fermes')
    .select('id, nom, code, timezone, rappel_matin, rappel_apresmidi, alerte_admin')
    .eq('actif', true)

  if (error) {
    console.error('[SUIVI FRIGO] Exploitations illisibles :', error.message)
    return json({ erreur: error.message }, 500)
  }

  for (const ferme of fermes ?? []) {
    const tz = ferme.timezone || 'Europe/Paris'
    const maintenant = creneau(heureLocale(tz))
    const jour = dateLocale(tz)

    const rappel1 = String(ferme.rappel_matin).slice(0, 5)
    const rappel2 = String(ferme.rappel_apresmidi).slice(0, 5)
    const alerte = String(ferme.alerte_admin).slice(0, 5)

    const estRappel = maintenant === rappel1 || maintenant === rappel2
    const estAlerte = maintenant === alerte
    if (!estRappel && !estAlerte) continue

    /* Pas de relevé le samedi ni le dimanche : ni rappel aux salariés, ni
       alerte de relevé manquant. Les alertes de dépassement de température
       ne sont pas concernées : elles partent depuis notify-releve, à la
       validation d'un relevé, quel que soit le jour. */
    const jsem = jourSemaine(tz)
    if (jsem === 0 || jsem === 6) {
      journal.push({ ferme: ferme.code, heure: maintenant, action: 'week_end' })
      continue
    }

    /* Produits réellement suivis ici : ceux qui ont au moins une chambre
       froide active. Inutile de réclamer un relevé d'échalotes à une
       exploitation qui n'en stocke pas. */
    const { data: frigos } = await admin
      .from('frigos')
      .select('produit')
      .eq('ferme_id', ferme.id)
      .eq('actif', true)

    const attendus = [...new Set((frigos ?? []).map((f) => f.produit || 'pdt'))]
      .sort((a, b) => rangProduit(a) - rangProduit(b))

    if (!attendus.length) {
      journal.push({ ferme: ferme.code, heure: maintenant, action: 'aucun_frigo' })
      continue
    }

    /* Chaque produit a son propre relevé : on regarde lesquels manquent. */
    const { data: valides } = await admin
      .from('releves')
      .select('produit')
      .eq('ferme_id', ferme.id)
      .eq('date_releve', jour)
      .eq('statut', 'valide')

    const faits = new Set((valides ?? []).map((r) => r.produit || 'pdt'))
    const manquants = attendus.filter((c) => !faits.has(c))

    if (!manquants.length) {
      journal.push({ ferme: ferme.code, heure: maintenant, action: 'releve_deja_fait' })
      continue
    }

    /* On ne nomme les produits que si l'exploitation en suit plusieurs :
       ailleurs, le message reste celui d'avant. */
    const liste = manquants.map((c) => libelleProduit(c).toLowerCase()).join(' et ')
    const detaille = attendus.length > 1
    const partiel = detaille && manquants.length < attendus.length

    /* ---------------- Rappel aux salariés ---------------- */
    if (estRappel) {
      const titre = maintenant === rappel1
        ? 'Relevé des températures'
        : 'Relevé toujours pas fait'
      const quoi = detaille ? ` (${liste})` : ''
      const texte = maintenant === rappel1
        ? `Bonjour ! C’est l’heure de relever les températures des frigos de ${ferme.nom}${quoi}.`
        : partiel
          ? `Il manque encore le relevé ${liste} pour ${ferme.nom} aujourd’hui.`
          : `Le relevé de ${ferme.nom} n’a pas encore été enregistré aujourd’hui${quoi}.`
      /* Version courte pour le SMS : un SMS standard tient en 160 caractères. */
      const texteSms = maintenant === rappel1
        ? `SUIVI FRIGO — ${ferme.nom} : relevé des températures à faire aujourd’hui${quoi}.`
        : partiel
          ? `SUIVI FRIGO — ${ferme.nom} : il manque encore le relevé ${liste}.`
          : `SUIVI FRIGO — ${ferme.nom} : le relevé des températures n’est toujours pas fait${quoi}.`

      const salaries = await destinataires(admin, ferme.id, ['salarie'])

      if (await dejaEnvoye(admin, ferme.id, 'rappel', titre)) {
        journal.push({ ferme: ferme.code, heure: maintenant, action: 'rappel_deja_envoye' })
      } else if (!salaries.length) {
        journal.push({ ferme: ferme.code, heure: maintenant, action: 'aucun_salarie' })
      } else {
        const ids = salaries.map((s) => s.id)
        await journaliser(admin, ferme.id, ids, {
          type: 'rappel', titre, corps: texte, lien: '/releve/nouveau',
        })
        const envoi = await envoyerPush(admin, ids, {
          type: 'rappel', titre, corps: texte, lien: '/releve/nouveau',
          tag: `rappel-${ferme.id}-${jour}-${maintenant}`,
        })
        const sms = await envoyerSms(salaries.map((s) => s.telephone), texteSms)
        journal.push({ ferme: ferme.code, heure: maintenant, action: 'rappel', manquants, ...envoi, sms })
      }
    }

    /* ---------------- Alerte aux administrateurs ---------------- */
    if (estAlerte) {
      const dateFr = jour.split('-').reverse().join('/')
      const titre = partiel
        ? `Relevé incomplet — ${ferme.nom}`
        : `Relevé manquant — ${ferme.nom}`
      const texte = partiel
        ? `Relevé incomplet aujourd’hui (${dateFr}) pour ${ferme.nom} : il manque ${liste}. ` +
          `Obligation de traçabilité non respectée.`
        : `Aucun relevé de température n’a été validé aujourd’hui (${dateFr}) ` +
          `pour ${ferme.nom}${detaille ? ` (${liste})` : ''}. Obligation de traçabilité non respectée.`
      const texteSms = partiel
        ? `SUIVI FRIGO — ${ferme.nom} : relevé incomplet, il manque ${liste}. Traçabilité non respectée.`
        : `SUIVI FRIGO — ${ferme.nom} : aucun relevé validé aujourd’hui. Traçabilité non respectée.`

      const admins = await destinataires(admin, ferme.id, ['admin', 'super_admin'])

      if (await dejaEnvoye(admin, ferme.id, 'alerte_manquant', titre)) {
        journal.push({ ferme: ferme.code, heure: maintenant, action: 'alerte_deja_envoyee' })
      } else if (!admins.length) {
        journal.push({ ferme: ferme.code, heure: maintenant, action: 'aucun_admin' })
      } else {
        const ids = admins.map((a) => a.id)
        await journaliser(admin, ferme.id, ids, {
          type: 'alerte_manquant', titre, corps: texte, lien: '/admin',
        })
        const envoi = await envoyerPush(admin, ids, {
          type: 'alerte_manquant', titre, corps: texte, lien: '/admin',
          tag: `manquant-${ferme.id}-${jour}`,
        })
        const sms = await envoyerSms(admins.map((a) => a.telephone), texteSms)
        journal.push({ ferme: ferme.code, heure: maintenant, action: 'alerte_manquant', manquants, ...envoi, sms })
      }
    }
  }

  console.log('[SUIVI FRIGO] cron', JSON.stringify(journal))
  return json({ ok: true, traite: (fermes ?? []).length, journal })
}
