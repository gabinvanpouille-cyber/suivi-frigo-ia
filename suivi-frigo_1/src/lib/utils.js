/* Utilitaires de date, de format et de calcul — tout en heure de Paris. */

export const TZ = 'Europe/Paris'

/** Date du jour au format ISO (AAAA-MM-JJ) dans le fuseau donné. */
export function aujourdhui(tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Heure courante au format HH:MM dans le fuseau donné. */
export function heureCourante(tz = TZ) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}

/** Décale une date ISO de n jours. */
export function decalerJours(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** « 2026-08-21 » -> « ven. 21 août 2026 » */
export function dateLongue(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))
}

/** « 2026-08-21 » -> « 21/08 » */
export function dateCourte(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))
}

/** « 2026-08-21 » -> « 21/08/2026 » */
export function dateFR(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))
}

/** « 14:32:00 » -> « 14:32 » */
export function heureCourte(t) {
  return t ? String(t).slice(0, 5) : ''
}

/** Horodatage complet lisible. */
export function horodatage(ts) {
  if (!ts) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(new Date(ts))
}

/** « il y a 3 min », « il y a 2 h »… */
export function depuis(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  const j = Math.floor(s / 86400)
  return j === 1 ? 'hier' : `il y a ${j} jours`
}

/** Affiche une température : 3 -> « 3,0 °C » */
export function temp(v) {
  if (v === null || v === undefined || v === '') return '—'
  return `${Number(v).toFixed(1).replace('.', ',')} °C`
}

/** Accepte la virgule française à la saisie. */
export function versNombre(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function estConforme(valeur, min, max) {
  const n = versNombre(valeur)
  if (n === null) return null
  return n >= Number(min) && n <= Number(max)
}

/** Étiquette d'écart pour une mesure hors seuils. */
export function ecart(valeur, min, max) {
  const n = versNombre(valeur)
  if (n === null) return null
  if (n > Number(max)) return `+${(n - Number(max)).toFixed(1).replace('.', ',')} °C au-dessus du seuil`
  if (n < Number(min)) return `${(n - Number(min)).toFixed(1).replace('.', ',')} °C sous le seuil`
  return null
}

export function pourcentage(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

/** Compresse une photo avant l'envoi (les téléphones produisent des fichiers énormes). */
export async function compresserImage(fichier, maxCote = 1400, qualite = 0.72) {
  if (!fichier.type.startsWith('image/')) return fichier
  const bitmap = await createImageBitmap(fichier).catch(() => null)
  if (!bitmap) return fichier

  let { width, height } = bitmap
  const ratio = Math.min(1, maxCote / Math.max(width, height))
  width = Math.round(width * ratio)
  height = Math.round(height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', qualite))
  if (!blob || blob.size >= fichier.size) return fichier
  return new File([blob], fichier.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** Regroupe un tableau par clé. */
export function grouper(liste, cle) {
  return liste.reduce((acc, item) => {
    const k = typeof cle === 'function' ? cle(item) : item[cle]
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})
}

/** Génère la liste des demi-heures pour les sélecteurs d'horaires. */
export function demiHeures() {
  const out = []
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '30']) out.push(`${String(h).padStart(2, '0')}:${m}`)
  }
  return out
}
