/* =====================================================================
 *  Service worker SUIVI FRIGO
 *  - met l'application en cache pour un fonctionnement hors ligne
 *  - reçoit et affiche les notifications push
 * ===================================================================== */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Navigation : on sert index.html depuis le cache (application monopage)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/\.netlify\//, /^\/api\//],
  })
)

// Photos des relevés : cache d'abord, elles ne changent jamais
registerRoute(
  ({ url, request }) =>
    request.destination === 'image' && url.pathname.includes('/storage/v1/object'),
  new CacheFirst({
    cacheName: 'photos-releves',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          response && response.status === 200 ? response : null,
      },
    ],
  })
)

// Appels API Supabase : réseau d'abord, cache de secours en cas de coupure
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({ cacheName: 'api-supabase', networkTimeoutSeconds: 6 })
)

/* ------------------------------------------------------------------ */
/*  Notifications push                                                 */
/* ------------------------------------------------------------------ */

const ICONE = '/icons/icon-192.png'
const BADGE = '/icons/icon-192.png'

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { titre: 'SUIVI FRIGO', corps: event.data ? event.data.text() : '' }
  }

  const urgent = data.type === 'alerte_temp' || data.type === 'alerte_manquant'

  const options = {
    body: data.corps || '',
    icon: ICONE,
    badge: BADGE,
    lang: 'fr',
    dir: 'ltr',
    tag: data.tag || data.type || 'suivi-frigo',
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [200, 100, 200, 100, 200] : [120],
    timestamp: Date.now(),
    data: { url: data.lien || '/', type: data.type || 'info' },
    actions: data.lien
      ? [{ action: 'ouvrir', title: 'Ouvrir' }, { action: 'fermer', title: 'Fermer' }]
      : [],
  }

  event.waitUntil(
    self.registration.showNotification(data.titre || 'SUIVI FRIGO', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'fermer') return

  const cible = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      for (const client of liste) {
        if ('focus' in client) {
          client.navigate(cible)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(cible)
    })
  )
})

// Le serveur push a invalidé l'abonnement : on demande au client de se réabonner
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      liste.forEach((c) => c.postMessage({ type: 'REABONNEMENT_PUSH_REQUIS' }))
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
