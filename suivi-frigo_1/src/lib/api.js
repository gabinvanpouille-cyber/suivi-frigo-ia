/* Appels aux Netlify Functions (opérations nécessitant des droits serveur). */
import { jetonAcces } from './supabase'

const BASE = '/.netlify/functions'

async function appeler(fonction, corps) {
  const jeton = await jetonAcces()
  if (!jeton) throw new Error('Session expirée, reconnectez-vous.')

  let reponse
  try {
    reponse = await fetch(`${BASE}/${fonction}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify(corps ?? {}),
    })
  } catch {
    throw new Error("Serveur injoignable. Vérifiez votre connexion internet.")
  }

  const texte = await reponse.text()
  let donnees = {}
  try {
    donnees = texte ? JSON.parse(texte) : {}
  } catch {
    donnees = { erreur: texte }
  }

  if (!reponse.ok) {
    throw new Error(donnees.erreur || `Erreur ${reponse.status}`)
  }
  return donnees
}

/* ---------------------------- Comptes ------------------------------- */

export const creerCompte = (p) => appeler('admin-users', { action: 'creer', ...p })
export const modifierCompte = (p) => appeler('admin-users', { action: 'modifier', ...p })
export const changerMotDePasse = (p) => appeler('admin-users', { action: 'motdepasse', ...p })
export const supprimerCompte = (p) => appeler('admin-users', { action: 'supprimer', ...p })

/* ---------------------------- Fermes -------------------------------- */

export const creerFerme = (p) => appeler('admin-fermes', { action: 'creer', ...p })
export const supprimerFerme = (p) => appeler('admin-fermes', { action: 'supprimer', ...p })

/* ---------------------------- Notifications ------------------------- */

/**
 * Déclenche le récapitulatif admin + les alertes de dépassement.
 * Volontairement non bloquant : si le réseau tombe, le relevé reste enregistré.
 */
export async function notifierReleve(releveId, evenement) {
  try {
    return await appeler('notify-releve', { releve_id: releveId, evenement })
  } catch (e) {
    console.warn('[SUIVI FRIGO] Notification non envoyée :', e.message)
    return { envoye: false, erreur: e.message }
  }
}

/** Envoi d'une notification de test sur l'appareil courant. */
export const testerNotification = () => appeler('notify-releve', { test: true })
