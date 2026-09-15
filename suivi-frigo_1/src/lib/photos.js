/* Envoi et lecture des photos de relevé (bucket privé « photos-releves »). */
import { supabase } from './supabase'
import { compresserImage } from './utils'

const BUCKET = 'photos-releves'
const cacheUrls = new Map()

/**
 * Envoie une photo. Le chemin impose le cloisonnement par ferme :
 *   <ferme_id>/<releve_id>/<nom>.jpg
 * @returns {Promise<string>} le chemin de stockage (à mettre dans photo_url)
 */
export async function envoyerPhoto(fichier, fermeId, releveId, prefixe = 'photo') {
  const compresse = await compresserImage(fichier)
  const extension = (compresse.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const nom = `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const chemin = `${fermeId}/${releveId}/${nom}`

  const { error } = await supabase.storage.from(BUCKET).upload(chemin, compresse, {
    cacheControl: '31536000',
    upsert: false,
    contentType: compresse.type,
  })
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`)
  return chemin
}

/** URL temporaire signée pour afficher une photo privée. */
export async function urlPhoto(chemin, secondes = 3600) {
  if (!chemin) return null
  if (chemin.startsWith('http')) return chemin

  const enCache = cacheUrls.get(chemin)
  if (enCache && enCache.expire > Date.now()) return enCache.url

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(chemin, secondes)
  if (error || !data?.signedUrl) return null

  cacheUrls.set(chemin, { url: data.signedUrl, expire: Date.now() + (secondes - 60) * 1000 })
  return data.signedUrl
}

/** Signe plusieurs chemins d'un coup. */
export async function urlsPhotos(chemins, secondes = 3600) {
  const utiles = [...new Set(chemins.filter(Boolean))]
  const sortie = {}
  await Promise.all(
    utiles.map(async (c) => {
      sortie[c] = await urlPhoto(c, secondes)
    })
  )
  return sortie
}

export async function supprimerPhoto(chemin) {
  if (!chemin || chemin.startsWith('http')) return
  await supabase.storage.from(BUCKET).remove([chemin])
  cacheUrls.delete(chemin)
}
