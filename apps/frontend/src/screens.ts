// The screens of the application: one list that the router, the navigation and the tests all read. A screen is
// loaded when it is first shown (a dynamic import), so the first paint carries only the shell.
import type { Component } from 'vue'

/** One screen: where it lives, what it is called, and how to load it. */
export interface Screen {
  /** A short name, unique among the screens (the route's name). */
  id: string
  /** The route, under the hash (`#/flight`). */
  path: string
  /** The message that names it, in the navigation and the title. */
  titleKey: string
  /** Loads its component. */
  load: () => Promise<{ default: Component }>
}

/** The screens of the product, in the order of the navigation; the first is where the application starts. */
export const PRODUCT_SCREENS: readonly Screen[] = [
  { id: 'flight', path: '/flight', titleKey: 'screen.flight', load: () => import('./screens/FlightData.vue') },
  { id: 'plan', path: '/plan', titleKey: 'screen.plan', load: () => import('./screens/NotAvailable.vue') },
  { id: 'setup', path: '/setup', titleKey: 'screen.setup', load: () => import('./screens/NotAvailable.vue') },
  { id: 'tune', path: '/tune', titleKey: 'screen.tune', load: () => import('./screens/NotAvailable.vue') },
  { id: 'parameters', path: '/parameters', titleKey: 'screen.parameters', load: () => import('./screens/Parameters.vue') },
  { id: 'logs', path: '/logs', titleKey: 'screen.logs', load: () => import('./screens/NotAvailable.vue') },
  { id: 'simulation', path: '/simulation', titleKey: 'screen.simulation', load: () => import('./screens/NotAvailable.vue') },
]

// The component gallery (every control of the kit in every state) is for whoever builds the
// interface: in development (`pnpm dev`, `pnpm ui`, the tests), never in the built application. The condition is the
// compile-time constant, so the build drops the screen together with its component and its stylesheet (build.test.ts
// checks that nothing of it is left).
const GALLERY: readonly Screen[] = import.meta.env.DEV
  ? [{ id: 'gallery', path: '/gallery', titleKey: 'screen.gallery', load: () => import('./screens/Gallery.vue') }]
  : []

/** The screens, in the order of the navigation: the product's, and in development the gallery last. */
export const SCREENS: readonly Screen[] = [...PRODUCT_SCREENS, ...GALLERY]

/** Where the application starts. */
export const HOME = SCREENS[0]?.path ?? '/'
