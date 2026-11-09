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

/** The screens, in the order of the navigation; the first is where the application starts. */
export const SCREENS: readonly Screen[] = [
  { id: 'flight', path: '/flight', titleKey: 'screen.flight', load: () => import('./screens/FlightData.vue') },
  { id: 'plan', path: '/plan', titleKey: 'screen.plan', load: () => import('./screens/NotAvailable.vue') },
  { id: 'setup', path: '/setup', titleKey: 'screen.setup', load: () => import('./screens/NotAvailable.vue') },
  { id: 'tune', path: '/tune', titleKey: 'screen.tune', load: () => import('./screens/NotAvailable.vue') },
  { id: 'parameters', path: '/parameters', titleKey: 'screen.parameters', load: () => import('./screens/Parameters.vue') },
  { id: 'logs', path: '/logs', titleKey: 'screen.logs', load: () => import('./screens/NotAvailable.vue') },
  { id: 'simulation', path: '/simulation', titleKey: 'screen.simulation', load: () => import('./screens/NotAvailable.vue') },
]

/** Where the application starts. */
export const HOME = SCREENS[0]?.path ?? '/'
