// The screens of the application: one list that the router, the navigation and the tests all read. A screen is
// loaded when it is first shown (a dynamic import), so the first paint carries only the shell.
import type { Component } from 'vue'
import type { IconName } from '@/lib/ui/icons'

/** One screen: where it lives, what it is called, and how to load it. */
export interface Screen {
  /** A short name, unique among the screens (the route's name). */
  id: string
  /** The route, under the hash (`#/flight`). */
  path: string
  /** The message that names it, in the navigation and the title. */
  titleKey: string
  /** Its icon in the rail. */
  icon: IconName
  /** `end` pins it to the bottom of the rail (Settings), apart from the screens of the flight work. */
  placement?: 'end'
  /** Loads its component. */
  load: () => Promise<{ default: Component }>
}

const NOT_AVAILABLE = () => import('./NotAvailable.vue')
const FLIGHT = () => import('./FlightData.vue')
const PARAMETERS = () => import('./Parameters.vue')
const SETTINGS = () => import('./Settings.vue')

/** The screens of the product, in the order of the rail; the first is where the application starts. */
export const PRODUCT_SCREENS: readonly Screen[] = [
  { id: 'flight', path: '/flight', titleKey: 'screen.flight', icon: 'navigation', load: FLIGHT },
  { id: 'plan', path: '/plan', titleKey: 'screen.plan', icon: 'route', load: NOT_AVAILABLE },
  { id: 'setup', path: '/setup', titleKey: 'screen.setup', icon: 'wrench', load: NOT_AVAILABLE },
  { id: 'parameters', path: '/parameters', titleKey: 'screen.parameters', icon: 'sliders', load: PARAMETERS },
  { id: 'tune', path: '/tune', titleKey: 'screen.tune', icon: 'activity', load: NOT_AVAILABLE },
  { id: 'logs', path: '/logs', titleKey: 'screen.logs', icon: 'file', load: NOT_AVAILABLE },
  { id: 'settings', path: '/settings', titleKey: 'screen.settings', icon: 'gear', placement: 'end', load: SETTINGS },
]

/** Where an address that was a screen once goes now: the simulator is a way to connect (the Connect dialog), not a screen. */
export const MOVED: Readonly<Record<string, string>> = { '/simulation': '/setup' }

// The component gallery (every control of the kit in every state) is for whoever builds the
// interface: in development (`pnpm dev`, `pnpm ui`, the tests), never in the built application. The condition is the
// compile-time constant, so the build drops the screen together with its component and its stylesheet (build.test.ts
// checks that nothing of it is left).
const GALLERY: readonly Screen[] = import.meta.env.DEV
  ? [{
    id: 'gallery',
    path: '/gallery',
    titleKey: 'screen.gallery',
    icon: 'folder',
    load: () => import('./Gallery.vue'),
  }]
  : []

/** The screens, in the order of the navigation: the product's, and in development the gallery last. */
export const SCREENS: readonly Screen[] = [...PRODUCT_SCREENS, ...GALLERY]

/** Where the application starts. */
export const HOME = SCREENS[0]?.path ?? '/'
