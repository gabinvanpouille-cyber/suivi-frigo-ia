/* Envoi des notifications : push web (VAPID), SMS (Twilio) et journal en base. */
import webpush from 'web-push'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@example.com'

let vapidPret = false
function preparerVapid() {
  if (vapidPret) return true
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[SUIVI FRIGO] Clés VAPID absentes : les notifications push sont désactivées.')
    return false
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  vapidPret = true
  return true
}

/**
 * Envoie une notification push à une liste d'utilisateurs.
 * Les abonnements périmés (404/410) sont supprimés automatiquement.
 */
export async function envoyerPush(admin, userIds, charge) {
  if (!userIds.length) return { envoyes: 0, echecs: 0 }
  if (!preparerVapid()) return { envoyes: 0, echecs: 0, ignore: 'vapid_absent' }

  const { data: abonnements, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .in('user_id', userIds)

  if (error || !abonnements?.length) return { envoyes: 0, echecs: 0 }

  const corps = JSON.stringify(charge)
  const perimes = []
  let envoyes = 0
  let echecs = 0

  await Promise.all(
    abonnements.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth_key } },
          corps,
          { TTL: 24 * 3600, urgency: charge.type?.startsWith('alerte') ? 'high' : 'normal' }
        )
        envoyes++
      } catch (e) {
        echecs++
        if (e.statusCode === 404 || e.statusCode === 410) perimes.push(a.id)
        else console.warn('[SUIVI FRIGO] Push refusé :', e.statusCode, e.body || e.message)
      }
    })
  )

  if (perimes.length) {
    await admin.from('push_subscriptions').delete().in('id', perimes)
  }
  return { envoyes, echecs, supprimes: perimes.length }
}

/** Enregistre les notifications dans le journal consultable dans l'application. */
export async function journaliser(admin, fermeId, destinataires, { type, titre, corps, lien }) {
  if (!destinataires.length) return
  const lignes = destinataires.map((id) => ({
    ferme_id: fermeId, destinataire_id: id, type, titre, corps: corps || null, lien: lien || null,
  }))
  const { error } = await admin.from('notifications').insert(lignes)
  if (error) console.warn('[SUIVI FRIGO] Journal de notification :', error.message)
}

/**
 * SMS via l'API Twilio. Silencieux et sans effet si Twilio n'est pas configuré :
 * l'application reste pleinement fonctionnelle avec les seules notifications push.
 */
export async function envoyerSms(numeros, texte) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const expediteur = process.env.TWILIO_FROM

  const destinataires = [...new Set((numeros || []).filter((n) => /^\+\d{8,15}$/.test(n || '')))]
  if (!destinataires.length) return { envoyes: 0, ignore: 'aucun_numero' }
  if (!sid || !token || !expediteur) return { envoyes: 0, ignore: 'twilio_non_configure' }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const entete = {
    Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  // Un SMS standard est limité à 160 caractères ; on tronque proprement.
  const message = texte.length > 300 ? `${texte.slice(0, 297)}…` : texte

  let envoyes = 0
  await Promise.all(
    destinataires.map(async (numero) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: entete,
          body: new URLSearchParams({ To: numero, From: expediteur, Body: message }),
        })
        if (r.ok) envoyes++
        else console.warn('[SUIVI FRIGO] SMS refusé :', r.status, await r.text())
      } catch (e) {
        console.warn('[SUIVI FRIGO] SMS impossible :', e.message)
      }
    })
  )
  return { envoyes, total: destinataires.length }
}

/** Comptes actifs d'une ferme, filtrés par rôle. */
export async function destinataires(admin, fermeId, roles) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, identifiant, nom_complet, telephone, role')
    .eq('ferme_id', fermeId)
    .eq('actif', true)
    .in('role', roles)
  if (error) {
    console.warn('[SUIVI FRIGO] Destinataires illisibles :', error.message)
    return []
  }
  return data ?? []
}
