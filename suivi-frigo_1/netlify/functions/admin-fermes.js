/* Création et suppression des exploitations — administrateur général uniquement. */
import {
  gerer, json, erreur, authentifier, exigerSuperAdmin, normaliser, emailTechnique,
} from './lib/commun.js'

export default gerer(async (request) => {
  const { profil, admin } = await authentifier(request)
  exigerSuperAdmin(profil)

  const corps = await request.json().catch(() => ({}))

  /* ---------------------------------------------------------------- */
  /*  Création d'une exploitation (+ son administrateur, facultatif)   */
  /* ---------------------------------------------------------------- */
  if (corps.action === 'creer') {
    const code = normaliser(corps.code)
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(code)) {
      return erreur('Code invalide : 2 à 31 caractères, minuscules, chiffres et tirets.')
    }
    if (!corps.nom?.trim()) return erreur('Le nom de l’exploitation est obligatoire.')

    const { data: dejaLa } = await admin
      .from('fermes').select('id').eq('code', code).maybeSingle()
    if (dejaLa) return erreur(`Le code « ${code} » est déjà utilisé par une autre exploitation.`)

    const { data: ferme, error: eFerme } = await admin
      .from('fermes')
      .insert({ code, nom: corps.nom.trim(), adresse: corps.adresse || null })
      .select('*')
      .single()
    if (eFerme) return erreur(eFerme.message)

    /* Administrateur initial — optionnel */
    let adminCree = false
    const identifiant = corps.admin_identifiant ? normaliser(corps.admin_identifiant) : null

    if (identifiant && corps.admin_mot_de_passe) {
      if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(identifiant)) {
        return json({
          ok: true, ferme, admin_cree: false,
          avertissement: 'Exploitation créée, mais l’identifiant administrateur est invalide.',
        })
      }
      if (corps.admin_mot_de_passe.length < 8) {
        return json({
          ok: true, ferme, admin_cree: false,
          avertissement: 'Exploitation créée, mais le mot de passe doit faire 8 caractères minimum.',
        })
      }

      const { data: cree, error: eAuth } = await admin.auth.admin.createUser({
        email: emailTechnique(identifiant, code),
        password: corps.admin_mot_de_passe,
        email_confirm: true,
        user_metadata: { identifiant, ferme_code: code },
      })

      if (eAuth) {
        return json({
          ok: true, ferme, admin_cree: false,
          avertissement: `Exploitation créée, mais le compte administrateur a échoué : ${eAuth.message}`,
        })
      }

      const { error: eProfil } = await admin.from('profiles').insert({
        id: cree.user.id,
        ferme_id: ferme.id,
        identifiant,
        nom_complet: corps.admin_nom || null,
        role: 'admin',
        actif: true,
      })

      if (eProfil) {
        await admin.auth.admin.deleteUser(cree.user.id).catch(() => {})
        return json({
          ok: true, ferme, admin_cree: false,
          avertissement: `Exploitation créée, mais le profil administrateur a échoué : ${eProfil.message}`,
        })
      }
      adminCree = true
    }

    return json({ ok: true, ferme, admin_cree: adminCree })
  }

  /* ---------------------------------------------------------------- */
  /*  Suppression d'une exploitation                                   */
  /* ---------------------------------------------------------------- */
  if (corps.action === 'supprimer') {
    const fermeId = corps.ferme_id
    if (!fermeId) return erreur('Identifiant d’exploitation manquant.')
    if (fermeId === profil.ferme_id) {
      return erreur('Basculez sur une autre exploitation avant de supprimer celle-ci.', 400)
    }

    // Suppression des comptes d'authentification associés (la cascade SQL ne les touche pas).
    const { data: comptes } = await admin
      .from('profiles').select('id').eq('ferme_id', fermeId)

    for (const c of comptes ?? []) {
      await admin.auth.admin.deleteUser(c.id).catch((e) =>
        console.warn('[SUIVI FRIGO] Compte non supprimé :', c.id, e.message)
      )
    }

    const { error } = await admin.from('fermes').delete().eq('id', fermeId)
    if (error) return erreur(error.message)

    return json({ ok: true, comptes_supprimes: (comptes ?? []).length })
  }

  return erreur('Action inconnue.')
})
