/* Création et gestion des comptes — nécessite la clé service_role.
   Toutes les vérifications de droits sont refaites ici côté serveur. */
import {
  gerer, json, erreur, authentifier, exigerAdmin, exigerSuperAdmin,
  normaliser, emailTechnique,
} from './lib/commun.js'

export default gerer(async (request) => {
  const { profil, admin } = await authentifier(request)
  const corps = await request.json().catch(() => ({}))
  const { action } = corps

  /* ---------------------------------------------------------------- */
  /*  Création d'un compte                                             */
  /* ---------------------------------------------------------------- */
  if (action === 'creer') {
    exigerAdmin(profil)

    const identifiant = normaliser(corps.identifiant)
    const role = corps.role === 'admin' ? 'admin'
      : corps.role === 'super_admin' ? 'super_admin' : 'salarie'
    const fermeId = corps.ferme_id || profil.ferme_id

    if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(identifiant)) {
      return erreur('Identifiant invalide : 2 à 31 caractères, minuscules, chiffres, point ou tiret.')
    }
    if (!corps.mot_de_passe || corps.mot_de_passe.length < 8) {
      return erreur('Le mot de passe doit contenir au moins 8 caractères.')
    }
    if (role === 'super_admin') exigerSuperAdmin(profil)
    if (fermeId !== profil.ferme_id && profil.role !== 'super_admin') {
      return erreur('Vous ne pouvez créer des comptes que dans votre exploitation.', 403)
    }

    const { data: ferme } = await admin
      .from('fermes').select('id, code, nom').eq('id', fermeId).maybeSingle()
    if (!ferme) return erreur('Exploitation introuvable.', 404)

    const { data: existant } = await admin
      .from('profiles').select('id')
      .eq('ferme_id', fermeId).eq('identifiant', identifiant).maybeSingle()
    if (existant) return erreur(`L’identifiant « ${identifiant} » est déjà utilisé dans cette exploitation.`)

    const email = emailTechnique(identifiant, ferme.code)

    const { data: cree, error: eAuth } = await admin.auth.admin.createUser({
      email,
      password: corps.mot_de_passe,
      email_confirm: true,
      user_metadata: { identifiant, ferme_code: ferme.code },
    })
    if (eAuth) {
      return erreur(
        /already been registered|already exists/i.test(eAuth.message)
          ? `L’identifiant « ${identifiant} » existe déjà pour cette exploitation.`
          : `Création impossible : ${eAuth.message}`
      )
    }

    const { error: eProfil } = await admin.from('profiles').insert({
      id: cree.user.id,
      ferme_id: fermeId,
      identifiant,
      nom_complet: corps.nom_complet || null,
      role,
      telephone: corps.telephone || null,
      actif: true,
    })

    if (eProfil) {
      // Annulation : on ne laisse pas un compte d'authentification orphelin.
      await admin.auth.admin.deleteUser(cree.user.id).catch(() => {})
      return erreur(`Création du profil impossible : ${eProfil.message}`)
    }

    return json({
      ok: true,
      user_id: cree.user.id,
      identifiant,
      code_ferme: ferme.code,
      message: `Compte créé. Connexion avec le code « ${ferme.code} » et l’identifiant « ${identifiant} ».`,
    })
  }

  /* ---------------------------------------------------------------- */
  /*  Modification d'un compte                                         */
  /* ---------------------------------------------------------------- */
  if (action === 'modifier') {
    const cible = corps.user_id
    if (!cible) return erreur('Identifiant du compte manquant.')

    const { data: profilCible } = await admin
      .from('profiles').select('*').eq('id', cible).maybeSingle()
    if (!profilCible) return erreur('Compte introuvable.', 404)

    const soiMeme = cible === profil.id
    if (!soiMeme) exigerAdmin(profil)
    if (!soiMeme && profilCible.ferme_id !== profil.ferme_id && profil.role !== 'super_admin') {
      return erreur('Ce compte appartient à une autre exploitation.', 403)
    }

    const champs = {}
    if ('nom_complet' in corps) champs.nom_complet = corps.nom_complet || null
    if ('telephone' in corps) champs.telephone = corps.telephone || null

    if ('role' in corps && corps.role) {
      exigerAdmin(profil)
      if (corps.role === 'super_admin') exigerSuperAdmin(profil)
      if (soiMeme && profil.role !== 'super_admin' && corps.role !== profil.role) {
        return erreur('Vous ne pouvez pas modifier votre propre rôle.', 403)
      }
      champs.role = corps.role
    }

    if ('actif' in corps) {
      exigerAdmin(profil)
      if (soiMeme && corps.actif === false) {
        return erreur('Vous ne pouvez pas désactiver votre propre compte.', 403)
      }
      champs.actif = !!corps.actif
    }

    // Changer de ferme : réservé à l'administrateur général (bascule d'exploitation).
    if ('ferme_id' in corps && corps.ferme_id) {
      exigerSuperAdmin(profil)
      const { data: ferme } = await admin
        .from('fermes').select('id, code').eq('id', corps.ferme_id).maybeSingle()
      if (!ferme) return erreur('Exploitation introuvable.', 404)
      champs.ferme_id = corps.ferme_id

      // L'adresse technique encode le code ferme : il faut la resynchroniser.
      const nouvelEmail = emailTechnique(profilCible.identifiant, ferme.code)
      await admin.auth.admin.updateUserById(cible, { email: nouvelEmail, email_confirm: true })
        .catch((e) => console.warn('[SUIVI FRIGO] Email technique non mis à jour :', e.message))
    }

    if (!Object.keys(champs).length) return json({ ok: true, message: 'Rien à modifier.' })

    const { error } = await admin.from('profiles').update(champs).eq('id', cible)
    if (error) return erreur(error.message)

    return json({ ok: true, message: 'Compte mis à jour.' })
  }

  /* ---------------------------------------------------------------- */
  /*  Changement de mot de passe                                       */
  /* ---------------------------------------------------------------- */
  if (action === 'motdepasse') {
    const cible = corps.user_id
    if (!cible) return erreur('Identifiant du compte manquant.')
    if (!corps.mot_de_passe || corps.mot_de_passe.length < 8) {
      return erreur('Le mot de passe doit contenir au moins 8 caractères.')
    }

    if (cible !== profil.id) {
      exigerAdmin(profil)
      const { data: profilCible } = await admin
        .from('profiles').select('ferme_id, role').eq('id', cible).maybeSingle()
      if (!profilCible) return erreur('Compte introuvable.', 404)
      if (profilCible.ferme_id !== profil.ferme_id && profil.role !== 'super_admin') {
        return erreur('Ce compte appartient à une autre exploitation.', 403)
      }
      if (profilCible.role === 'super_admin') exigerSuperAdmin(profil)
    }

    const { error } = await admin.auth.admin.updateUserById(cible, { password: corps.mot_de_passe })
    if (error) return erreur(error.message)

    return json({ ok: true, message: 'Mot de passe modifié.' })
  }

  /* ---------------------------------------------------------------- */
  /*  Suppression d'un compte                                          */
  /* ---------------------------------------------------------------- */
  if (action === 'supprimer') {
    exigerAdmin(profil)
    const cible = corps.user_id
    if (!cible) return erreur('Identifiant du compte manquant.')
    if (cible === profil.id) return erreur('Vous ne pouvez pas supprimer votre propre compte.', 403)

    const { data: profilCible } = await admin
      .from('profiles').select('ferme_id, role, identifiant').eq('id', cible).maybeSingle()
    if (!profilCible) return erreur('Compte introuvable.', 404)
    if (profilCible.ferme_id !== profil.ferme_id && profil.role !== 'super_admin') {
      return erreur('Ce compte appartient à une autre exploitation.', 403)
    }
    if (profilCible.role === 'super_admin') exigerSuperAdmin(profil)

    // Les relevés conservent le nom de leur auteur (colonne auteur_nom figée à la
    // saisie) : la suppression du compte n'efface aucune trace réglementaire.
    const { error } = await admin.auth.admin.deleteUser(cible)
    if (error) return erreur(error.message)

    return json({ ok: true, message: `Compte « ${profilCible.identifiant} » supprimé.` })
  }

  return erreur('Action inconnue.')
})
