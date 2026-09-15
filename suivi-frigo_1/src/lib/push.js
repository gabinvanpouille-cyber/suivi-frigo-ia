/* Gestion des notifications push (Web Push / VAPID). */
import { supabase } from './supabase'

const CLE_PUBLIQUE = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** Le navigateur sait-il faire du push ? */
export function pushDisponible() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** L'application tourne-t-elle en mode installé (indispensable sur iOS) ? */
export function estInstallee() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function estIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function permissionActuelle() {
  return pushDisponible() ? Notification.permission : 'unsupported'
}

function base64UrlVersUint8(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const brut = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...brut].map((c) => c.charCodeAt(0)))
}

/**
 * Demande la permission puis enregistre l'abonnement dans Supabase.
 * Renvoie { ok, message }.
 */
export async function activerNotifications(profil) {
  if (!pushDisponible()) {
    return { ok: false, message: "Ce navigateur ne gère pas les notifications." }
  }
  if (estIOS() && !estInstallee()) {
    return {
      ok: false,
      message:
        "Sur iPhone et iPad, ajoutez d'abord SUIVI FRIGO à l'écran d'accueil " +
        "(bouton Partager ▸ « Sur l'écran d'accueil »), puis ouvrez l'application depuis cette icône.",
    }
  }
  if (!CLE_PUBLIQUE) {
    return { ok: false, message: 'Clé VAPID absente : configurez VITE_VAPID_PUBLIC_KEY.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      message:
        permission === 'denied'
          ? "Notifications refusées. Réautorisez-les dans les réglages du navigateur pour ce site."
          : 'Notifications non activées.',
    }
  }

  const registration = await navigator.serviceWorker.ready

  let abonnement = await registration.pushManager.getSubscription()
  if (abonnement) {
    // Si la clé du serveur a changé, l'ancien abonnement est inutilisable.
    const ancienne = abonnement.options?.applicationServerKey
    const attendue = base64UrlVersUint8(CLE_PUBLIQUE)
    const identique =
      ancienne &&
      new Uint8Array(ancienne).length === attendue.length &&
      new Uint8Array(ancienne).every((v, i) => v === attendue[i])
    if (!identique) {
      await abonnement.unsubscribe().catch(() => {})
      abonnement = null
    }
  }

  if (!abonnement) {
    abonnement = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlVersUint8(CLE_PUBLIQUE),
    })
  }

  const brut = abonnement.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: profil.id,
      ferme_id: profil.ferme_id,
      endpoint: brut.endpoint,
      p256dh: brut.keys.p256dh,
      auth_key: brut.keys.auth,
      user_agent: navigator.userAgent.slice(0, 250),
    },
    { onConflict: 'endpoint' }
  )

  if (error) return { ok: false, message: `Enregistrement impossible : ${error.message}` }
  return { ok: true, message: 'Notifications activées sur cet appareil.' }
}

/** Désactive les notifications sur cet appareil uniquement. */
export async function desactiverNotifications() {
  if (!pushDisponible()) return { ok: false, message: 'Non disponible.' }
  const registration = await navigator.serviceWorker.ready
  const abonnement = await registration.pushManager.getSubscription()
  if (abonnement) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', abonnement.endpoint)
    await abonnement.unsubscribe().catch(() => {})
  }
  return { ok: true, message: 'Notifications désactivées sur cet appareil.' }
}

/** Cet appareil est-il déjà abonné ? */
export async function abonnementActif() {
  if (!pushDisponible() || Notification.permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.ready
    return !!(await registration.pushManager.getSubscription())
  } catch {
    return false
  }
}
