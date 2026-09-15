/* Utilitaires partagés par les Netlify Functions.
   Ce dossier « lib » n'est pas déployé comme fonction : il est simplement
   inclus dans le paquet des fonctions qui l'importent. */
import { createClient } from '@supabase/supabase-js'

const URL_SUPABASE = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export const DOMAINE_TECHNIQUE = 'suivifrigo.app'

/** Client avec droits complets : contourne les politiques RLS. À usage serveur strict. */
export function clientAdmin() {
  if (!URL_SUPABASE || !CLE_SERVICE) {
    throw new Error(
      'Configuration serveur incomplète : VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises.'
    )
  }
  return createClient(URL_SUPABASE, CLE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/* ----------------------------- Réponses HTTP ------------------------- */

export const json = (donnees, statut = 200) =>
  new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

export const erreur = (message, statut = 400) => json({ erreur: message }, statut)

/* ----------------------------- Authentification ---------------------- */

/**
 * Vérifie le jeton porteur et renvoie { utilisateur, profil }.
 * Lève une erreur explicite si le jeton est absent ou invalide.
 */
export async function authentifier(request) {
  const entete = request.headers.get('authorization') || ''
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : null
  if (!jeton) throw Object.assign(new Error('Jeton d’authentification absent.'), { statut: 401 })

  const lecteur = createClient(URL_SUPABASE, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await lecteur.auth.getUser(jeton)
  if (error || !data?.user) {
    throw Object.assign(new Error('Session invalide ou expirée.'), { statut: 401 })
  }

  const admin = clientAdmin()
  const { data: profil } = await admin
    .from('profiles')
    .select('*, ferme:fermes(*)')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profil) throw Object.assign(new Error('Profil introuvable.'), { statut: 403 })
  if (!profil.actif) throw Object.assign(new Error('Compte désactivé.'), { statut: 403 })

  return { utilisateur: data.user, profil, admin }
}

export function exigerAdmin(profil) {
  if (!['admin', 'super_admin'].includes(profil.role)) {
    throw Object.assign(new Error('Droits administrateur requis.'), { statut: 403 })
  }
}

export function exigerSuperAdmin(profil) {
  if (profil.role !== 'super_admin') {
    throw Object.assign(new Error('Droits d’administrateur général requis.'), { statut: 403 })
  }
}

/* ----------------------------- Divers -------------------------------- */

export function normaliser(valeur = '') {
  return String(valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
}

export const emailTechnique = (identifiant, codeFerme) =>
  `${normaliser(identifiant)}.${normaliser(codeFerme)}@${DOMAINE_TECHNIQUE}`

/** Heure locale « HH:MM » dans le fuseau donné. */
export function heureLocale(tz = 'Europe/Paris') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date())
}

/** Date locale « AAAA-MM-JJ » dans le fuseau donné. */
export function dateLocale(tz = 'Europe/Paris') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Formate une température : 3 -> « 3,0 °C ». */
export const formaterTemp = (v) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(1).replace('.', ',')} °C`

/** Enveloppe commune : gestion d'erreur et méthode HTTP. */
export function gerer(traitement) {
  return async (request, contexte) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
    if (request.method !== 'POST') return erreur('Méthode non autorisée.', 405)
    try {
      return await traitement(request, contexte)
    } catch (e) {
      console.error('[SUIVI FRIGO]', e)
      return erreur(e.message || 'Erreur interne.', e.statut || 500)
    }
  }
}
