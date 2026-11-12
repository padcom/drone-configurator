// The screens of the application: one list that the router, the navigation and the tests all read. A screen is
// loaded when it is first shown (a dynamic import), so the first paint carries only the shell.
import type { Component } from 'vue'
import type { IconName } from '@/lib/ui/icons'

/** A part of a screen that has its own address (`#/logs/vehicle`), shown under the screen's tabs. */
export interface Section {
  /** A short name, unique within its screen; the route is named `<screen>.<id>`. */
  id: string
  /** The route under the screen's, without a slash (`vehicle`). */
  path: string
  /** The message that names it: on its tab, and in the title of its page. */
  titleKey: string
  /** Loads its component. */
  load: () => Promise<{ default: Component }>
}

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
  /** Where the focus goes when the screen is chosen with its command (the rail, the palette): a place of its own, by name. */
  focus?: 'params.search'
  /**
   * Its parts, when it has them: the screen's component shows their tabs and the part that is chosen (a nested route each); the
   * first is where the screen opens, or the one last shown. Its path alone is no page.
   */
  sections?: readonly Section[]
  /** Loads its component. */
  load: () => Promise<{ default: Component }>
}

const NOT_AVAILABLE = () => import('./NotAvailable.vue')
const LOGS = () => import('./Logs.vue')
const LOGS_SECTION = () => import('./logs/LogsSection.vue')

/** The parts of the Logs screen, in the order of their tabs (the design's LogsNav). */
const LOGS_SECTIONS: readonly Section[] = [
  { id: 'flights', path: 'flights', titleKey: 'logs.section.flights', load: LOGS_SECTION },
  { id: 'replay', path: 'replay', titleKey: 'logs.section.replay', load: LOGS_SECTION },
  { id: 'spectrum', path: 'spectrum', titleKey: 'logs.section.spectrum', load: LOGS_SECTION },
  { id: 'vehicle', path: 'vehicle', titleKey: 'logs.section.vehicle', load: LOGS_SECTION },
  { id: 'tools', path: 'tools', titleKey: 'logs.section.tools', load: LOGS_SECTION },
]
const FLIGHT = () => import('./FlightData.vue')
const PARAMETERS = () => import('./Parameters.vue')
const SETTINGS = () => import('./Settings.vue')

/** The screens of the product, in the order of the rail; the first is where the application starts. */
export const PRODUCT_SCREENS: readonly Screen[] = [
  { id: 'flight', path: '/flight', titleKey: 'screen.flight', icon: 'navigation', load: FLIGHT },
  { id: 'plan', path: '/plan', titleKey: 'screen.plan', icon: 'route', load: NOT_AVAILABLE },
  { id: 'setup', path: '/setup', titleKey: 'screen.setup', icon: 'wrench', load: NOT_AVAILABLE },
  {
    id: 'parameters',
    path: '/parameters',
    titleKey: 'screen.parameters',
    icon: 'sliders',
    focus: 'params.search',
    load: PARAMETERS,
  },
  { id: 'tune', path: '/tune', titleKey: 'screen.tune', icon: 'activity', load: NOT_AVAILABLE },
  { id: 'logs', path: '/logs', titleKey: 'screen.logs', icon: 'file', sections: LOGS_SECTIONS, load: LOGS },
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

/**
 * The name of the route of a part of a screen.
 *
 * @param screen the screen's id
 * @param section the part's id
 * @returns `<screen>.<section>`
 */
export const sectionRouteName = (screen: string, section: string): string => `${screen}.${section}`

/** Where the application starts. */
export const HOME = SCREENS[0]?.path ?? '/'
