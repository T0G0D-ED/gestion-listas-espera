import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)          // app shell con hash, generado por Vite
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

const DATA = 'data-v1'

// Red primero; sin red, responde desde caché marcando x-from-cache para que la UI no falsee la sincronización
registerRoute(({ request, url }) => request.method === 'GET' && url.pathname === '/api/cupos', async ({ request }) => {
  const cache = await caches.open(DATA)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch {
    const hit = await cache.match(request)
    if (!hit) return new Response('[]', { status: 503, headers: { 'Content-Type': 'application/json' } })
    const h = new Headers(hit.headers); h.set('x-from-cache', '1')
    return new Response(hit.body, { status: 200, headers: h })
  }
})
