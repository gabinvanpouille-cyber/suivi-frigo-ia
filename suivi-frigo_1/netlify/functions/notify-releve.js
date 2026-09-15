/* Notifications déclenchées par la validation ou la modification d'un relevé :
   récapitulatif aux administrateurs, alerte à tous en cas de dépassement,
   et SMS si Twilio est configuré. */
import { gerer, json, erreur, authentifier, formaterTemp } from './lib/commun.js'
import { envoyerPush, envoyerSms, journaliser, destinataires } from './lib/notifs.js'

const dateFR = (iso) =>
  iso ? new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`)) : ''

const ecart = (t, min, max) => {
  const v = Number(t)
  if (v > Number(max)) return `+${(v - Number(max)).toFixed(1).replace('.', ',')} °C au-dessus`
  if (v < Number(min)) return `${(v - Number(min)).toFixed(1).replace('.', ',')} °C en dessous`
  return ''
}

export default gerer(async (request) => {
  const { profil, admin } = await authentifier(request)
  const corps = await request.json().catch(() => ({}))

  /* ---------------------------------------------------------------- */
  /*  Notification de test (bouton dans les réglages)                  */
  /* ---------------------------------------------------------------- */
  if (corps.test) {
    const r = await envoyerPush(admin, [profil.id], {
      type: 'rappel',
      titre: 'SUIVI FRIGO — test',
      corps: 'Les notifications fonctionnent correctement sur cet appareil.',
      lien: '/reglages',
      tag: 'test',
    })
    if (r.ignore === 'vapid_absent') {
      return erreur('Clés VAPID non configurées sur le serveur.', 500)
    }
    if (!r.envoyes) {
      return erreur('Aucun appareil abonné. Activez les notifications puis réessayez.', 400)
    }
    return json({ ok: true, ...r })
  }

  /* ---------------------------------------------------------------- */
  /*  Récapitulatif d'un relevé                                        */
  /* ---------------------------------------------------------------- */
  const releveId = corps.releve_id
  const evenement = corps.evenement === 'modification' ? 'modification' : 'validation'
  if (!releveId) return erreur('Identifiant de relevé manquant.')

  const { data: releve, error } = await admin
    .from('releves')
    .select(
      'id, ferme_id, date_releve, heure_releve, statut, remarque, nb_modifications, auteur_nom,' +
      ' ferme:fermes(id, nom, code),' +
      ' auteur:profiles(identifiant, nom_complet),' +
      ' mesures(temperature, seuil_min, seuil_max, conforme, remarque, frigo:frigos(nom, emplacement))'
    )
    .eq('id', releveId)
    .maybeSingle()

  if (error || !releve) return erreur('Relevé introuvable.', 404)
  if (releve.ferme_id !== profil.ferme_id && profil.role !== 'super_admin') {
    return erreur('Ce relevé appartient à une autre exploitation.', 403)
  }

  const auteur = releve.auteur?.nom_complet || releve.auteur?.identifiant || releve.auteur_nom || 'un salarié'
  const quand = `${dateFR(releve.date_releve)} à ${String(releve.heure_releve).slice(0, 5)}`
  const mesures = releve.mesures ?? []
  const horsSeuils = mesures.filter((m) => m.conforme === false)

  /* ---- Texte du récapitulatif ---- */
  const lignes = mesures.map((m) => {
    const marque = m.conforme === false ? '⚠' : '✓'
    return `${marque} ${m.frigo?.nom} : ${formaterTemp(m.temperature)}`
  })
  const recapCorps =
    `${releve.ferme?.nom} — relevé du ${quand} par ${auteur}\n` +
    lignes.join('\n') +
    (releve.remarque ? `\nRemarque : ${releve.remarque}` : '')

  const recapTitre = evenement === 'modification'
    ? `Relevé modifié (révision ${releve.nb_modifications})`
    : horsSeuils.length
      ? `Relevé validé — ${horsSeuils.length} dépassement${horsSeuils.length > 1 ? 's' : ''}`
      : 'Relevé validé'

  /* ---- Destinataires ---- */
  const admins = await destinataires(admin, releve.ferme_id, ['admin', 'super_admin'])
  const tous = await destinataires(admin, releve.ferme_id, ['admin', 'super_admin', 'salarie'])

  const resultat = { recap: null, alerte: null, sms: null }

  /* ---- Journal + push du récapitulatif ---- */
  await journaliser(admin, releve.ferme_id, admins.map((a) => a.id), {
    type: evenement === 'modification' ? 'modification' : 'recap',
    titre: recapTitre,
    corps: recapCorps,
    lien: '/admin/releves',
  })

  /* ---- Alerte de dépassement : tous les comptes + SMS ---- */
  if (horsSeuils.length) {
    const detail = horsSeuils
      .map((m) =>
        `${m.frigo?.nom} : ${formaterTemp(m.temperature)} ` +
        `(${ecart(m.temperature, m.seuil_min, m.seuil_max)}, ` +
        `seuils ${formaterTemp(m.seuil_min)} à ${formaterTemp(m.seuil_max)})`
      )
      .join('\n')

    const titreAlerte = `ALERTE température — ${releve.ferme?.nom}`
    const corpsAlerte = `${horsSeuils.length} frigo(s) hors seuils, relevé du ${quand} :\n${detail}`

    await journaliser(admin, releve.ferme_id, tous.map((p) => p.id), {
      type: 'alerte_temp',
      titre: titreAlerte,
      corps: corpsAlerte,
      lien: '/admin/releves',
    })

    resultat.alerte = await envoyerPush(admin, tous.map((p) => p.id), {
      type: 'alerte_temp',
      titre: titreAlerte,
      corps: corpsAlerte,
      lien: '/admin/releves',
      tag: `alerte-${releve.id}`,
    })

    resultat.sms = await envoyerSms(
      tous.map((p) => p.telephone),
      `SUIVI FRIGO — ALERTE ${releve.ferme?.nom} : ` +
      horsSeuils.map((m) => `${m.frigo?.nom} ${formaterTemp(m.temperature)}`).join(', ') +
      ` (relevé du ${quand}). Intervention requise.`
    )
  } else {
    // Pas de dépassement : seuls les administrateurs sont notifiés.
    resultat.recap = await envoyerPush(admin, admins.map((a) => a.id), {
      type: evenement === 'modification' ? 'modification' : 'recap',
      titre: recapTitre,
      corps: recapCorps,
      lien: '/admin/releves',
      tag: `releve-${releve.id}`,
    })
  }

  /* ---- Une modification est toujours signalée aux administrateurs ---- */
  if (evenement === 'modification' && horsSeuils.length) {
    await envoyerPush(admin, admins.map((a) => a.id), {
      type: 'modification',
      titre: recapTitre,
      corps: recapCorps,
      lien: '/admin/releves',
      tag: `modif-${releve.id}`,
    })
  }

  return json({ ok: true, hors_seuils: horsSeuils.length, ...resultat })
})
