// The router. The host serves one document, so the screens are told apart by the part of the URL after the `#`
// (no server routing).
import { type Router, type RouterHistory, createRouter, createWebHashHistory } from 'vue-router'
import { HOME, MOVED, SCREENS } from './screens'

/**
 * A router over the screens: the first screen at `/` and for any path that is none of them. A screen that was shown
 * stays alive (the shell keeps it), but the page is one document, so how far it was scrolled is not kept by the
 * screen: the router remembers it when the screen is left and gives it back when the screen is shown again.
 *
 * @param history where the position is kept (the hash of the URL by default; tests give a memory history)
 * @param scrolled how far the page is scrolled now, in pixels
 * @returns the router
 */
export function createAppRouter(history: RouterHistory = createWebHashHistory(), scrolled = () => window.scrollY): Router {
  const leftAt = new Map<string, number>()
  const router = createRouter({
    history,
    routes: [
      ...SCREENS.map(screen => ({
        path: screen.path,
        name: screen.id,
        component: screen.load,
        meta: { titleKey: screen.titleKey },
      })),
      ...Object.entries(MOVED).map(([path, redirect]) => ({ path, redirect })),
      { path: '/:rest(.*)*', redirect: HOME },
    ],
    // A screen shown for the first time starts at the top.
    scrollBehavior: to => ({ top: leftAt.get(to.path) ?? 0 }),
  })
  router.beforeEach((_to, from) => {
    leftAt.set(from.path, scrolled())
  })

  return router
}
