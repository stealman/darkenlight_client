import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Darkenlight itself needs an active WebSocket connection, so the application
// shell is precached but runtime models, textures and sounds remain
// network-loaded instead of filling the device cache during installation.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
