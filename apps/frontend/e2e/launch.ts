// `launchApp` for the end-to-end tests, with the application's data and cache directories in a temporary folder of the
// test file's own (the host and the backend read XDG_DATA_HOME and XDG_CACHE_HOME). The application keeps its settings
// there, so a test never reads or changes the settings of the machine it runs on, and one file's choices are not
// another's. Every app a file launches shares that folder (a restart of the app in the same file sees what the first run
// kept); the folder goes when the file's process does.
// The map's tiles are OFF in that folder unless the test's own settings say otherwise: the app starts on the Flight data screen,
// whose map would ask a tile server for its tiles, and no test ever calls a real one (flight-map.e2e.ts has a server of its own).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { type E2eApp, type LaunchOptions, launchApp as launch } from 'pico-desktop'

/** The folder of this file's run. */
export const home = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))

process.env.XDG_DATA_HOME = join(home, 'data')
process.env.XDG_CACHE_HOME = join(home, 'cache')
process.once('exit', () => rmSync(home, { recursive: true, force: true }))

/** The settings document of the app in this folder. */
const SETTINGS = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator', 'settings.json')

/** One entry of the settings' `ui` list. */
interface Entry {
  key: string
  value: string
}

/** Makes sure the settings say the map's tiles are off, unless the test's own settings say whether they are. */
function keepTilesOff(): void {
  const found = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) as { version: number, ui: Entry[] } : null
  const document = found ?? { version: 1, ui: [] }
  if (!document.ui.some(entry => entry.key === 'map.enabled')) {
    mkdirSync(dirname(SETTINGS), { recursive: true })
    writeFileSync(SETTINGS, `${JSON.stringify({ ...document, ui: [...document.ui, { key: 'map.enabled', value: 'false' }] })}\n`)
  }
}

/**
 * Starts the app that `pico-desktop test --e2e` built, and connects to its page (with the map's tiles off, see above).
 *
 * @param options more host arguments, and how long the window may take
 * @returns the app
 */
export function launchApp(options?: LaunchOptions): Promise<E2eApp> {
  keepTilesOff()

  return launch(options)
}

export type { E2eApp }
