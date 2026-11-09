// The router. The host serves one document, so the screens are told apart by the part of the URL after the `#`
// (no server routing).
import { type Router, type RouterHistory, createRouter, createWebHashHistory } from 'vue-router'
import { HOME, SCREENS } from './screens'

/**
 * A router over the screens: the first screen at `/` and for any path that is none of them.
 *
 * @param history where the position is kept (the hash of the URL by default; tests give a memory history)
 * @returns the router
 */
export function createAppRouter(history: RouterHistory = createWebHashHistory()): Router {
  return createRouter({
    history,
    routes: [
      ...SCREENS.map(screen => ({
        path: screen.path,
        name: screen.id,
        component: screen.load,
        meta: { titleKey: screen.titleKey },
      })),
      { path: '/:rest(.*)*', redirect: HOME },
    ],
  })
}
