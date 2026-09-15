import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // Message explicite : c'est l'erreur de configuration la plus fréquente.
  console.error(
    "[SUIVI FRIGO] VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont manquantes. " +
    "Ajoutez-les dans .env (local) et dans Netlify > Environment variables."
  )
}

export const supabase = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'suivifrigo-auth',
  },
  global: { headers: { 'x-application-name': 'suivi-frigo' } },
})

/** Domaine technique : aucun email n'est réellement envoyé à cette adresse. */
export const DOMAINE_TECHNIQUE = 'suivifrigo.app'

/** Normalise un identifiant ou un code ferme (minuscules, sans accent ni espace). */
export function normaliser(valeur = '') {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
}

/**
 * Reconstruit l'adresse technique utilisée par Supabase Auth à partir
 * du couple « code ferme + identifiant ». Aucune requête réseau nécessaire.
 */
export function emailTechnique(identifiant, codeFerme) {
  return `${normaliser(identifiant)}.${normaliser(codeFerme)}@${DOMAINE_TECHNIQUE}`
}

/** Jeton d'accès courant, requis par les Netlify Functions. */
export async function jetonAcces() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}
