// `launchApp` for the end-to-end tests, with the application's data and cache directories in a temporary folder of the
// test file's own (the host and the backend read XDG_DATA_HOME and XDG_CACHE_HOME). The application keeps its settings
// there, so a test never reads or changes the settings of the machine it runs on, and one file's choices are not
// another's. Every app a file launches shares that folder (a restart of the app in the same file sees what the first run
// kept); the folder goes when the file's process does.
// The map's tiles are OFF in that folder unless the test's own settings say otherwise: the app starts on the Flight data screen,
// whose map would ask a tile server for its tiles, and no test ever calls a real one (flight-map.e2e.ts has a server of its own).
// The recording of every connection (#30) is OFF too unless the test's settings say otherwise (`presetSettings`): a recording
// is a log in Flights, and the specs that look at Flights count on the logs they made themselves.
// The download of the connected vehicle's parameter metadata (#35) is OFF too unless the test's settings say otherwise: no test
// asks ArduPilot's server by accident, and the specs that look at a parameter's description count on the metadata they loaded.
// The last connection is the built-in simulator unless the test's own settings say otherwise: a new install opens the Connect
// dialog on UDP (#27), and the tests that only press Connect mean the simulator (one-key.e2e.ts starts from what it chooses).
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

/** What the settings of a test hold when the test says nothing of them. */
const QUIET: readonly Entry[] = [
  { key: 'map.enabled', value: 'false' },
  { key: 'recording.enabled', value: 'false' },
  { key: 'metadata.download', value: 'off' },
  { key: 'connect.last', value: JSON.stringify({ transport: 'simulator', host: '', port: '', device: '', baud: '' }) },
]

/**
 * The settings document in the folder (an empty one when there is none yet).
 *
 * @returns the document
 */
function settingsDocument(): { version: number, ui: Entry[] } {
  const empty = { version: 1, ui: [] }

  return existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) as { version: number, ui: Entry[] } : empty
}

/**
 * Puts entries into the settings the next launch starts with (an entry with the same key is replaced).
 *
 * @param entries the entries
 */
export function presetSettings(entries: readonly Entry[]): void {
  const document = settingsDocument()
  const kept = document.ui.filter(entry => !entries.some(one => one.key === entry.key))
  mkdirSync(dirname(SETTINGS), { recursive: true })
  writeFileSync(SETTINGS, `${JSON.stringify({ ...document, ui: [...kept, ...entries] })}\n`)
}

/** Makes sure the settings hold the defaults above (tiles and recording off, the simulator last) the test does not set. */
function keepQuiet(): void {
  const document = settingsDocument()
  const missing = QUIET.filter(entry => !document.ui.some(one => one.key === entry.key))
  if (missing.length > 0) {
    presetSettings(missing)
  }
}

/**
 * Starts the app that `pico-desktop test --e2e` built, and connects to its page (with the defaults above).
 *
 * @param options more host arguments, and how long the window may take
 * @returns the app
 */
export function launchApp(options?: LaunchOptions): Promise<E2eApp> {
  keepQuiet()

  return launch(options)
}

export type { E2eApp }
