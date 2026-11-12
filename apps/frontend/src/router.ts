// The router. The host serves one document, so the screens are told apart by the part of the URL after the `#`
// (no server routing).
import { type RouteRecordRaw, type Router, type RouterHistory, createRouter, createWebHashHistory } from 'vue-router'
import { HOME, MOVED, SCREENS, type Screen, sectionRouteName } from '@/screens/registry'

/**
 * The route of a screen: a plain one, or, for a screen with parts, the screen with a route for each part under it. The screen's
 * own address opens the part that was shown last (`lastShown`), else the first.
 *
 * @param screen the screen
 * @param lastShown the part of each screen that was shown last, by the screen's id
 * @returns the route
 */
function routeOf(screen: Screen, lastShown: ReadonlyMap<string, string>): RouteRecordRaw {
  const meta = { titleKey: screen.titleKey }
  const sections = screen.sections ?? []
  const [first] = sections
  if (!first) {
    return { path: screen.path, name: screen.id, component: screen.load, meta }
  }
  const opens = () => ({ name: sectionRouteName(screen.id, lastShown.get(screen.id) ?? first.id) })

  return {
    path: screen.path,
    component: screen.load,
    meta,
    children: [
      { path: '', name: screen.id, redirect: opens },
      ...sections.map(section => ({
        path: section.path,
        name: sectionRouteName(screen.id, section.id),
        component: section.load,
        // The part's own name is its title; the screen's stays available (a document title says both). The part is also a
        // prop, so that a part that is kept alive while hidden does not change with the route.
        meta: { titleKey: section.titleKey, screenTitleKey: screen.titleKey, screen: screen.id, section: section.id },
        props: { section: section.id },
      })),
      // An address under the screen that is no part opens the screen (the part shown last, else the first), not the home page.
      { path: ':rest(.*)*', redirect: opens },
    ],
  }
}

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
  // The part of a screen that was shown last, so that the screen's own address (the rail) comes back to it.
  const lastShown = new Map<string, string>()
  const router = createRouter({
    history,
    routes: [
      ...SCREENS.map(screen => routeOf(screen, lastShown)),
      ...Object.entries(MOVED).map(([path, redirect]) => ({ path, redirect })),
      { path: '/:rest(.*)*', redirect: HOME },
    ],
    // A screen shown for the first time starts at the top.
    scrollBehavior: to => ({ top: leftAt.get(to.path) ?? 0 }),
  })
  router.beforeEach((_to, from) => {
    leftAt.set(from.path, scrolled())
  })
  router.afterEach(to => {
    const { screen, section } = to.meta
    if (typeof screen === 'string' && typeof section === 'string') {
      lastShown.set(screen, section)
    }
  })

  return router
}
