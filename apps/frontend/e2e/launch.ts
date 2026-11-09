// `launchApp` for the end-to-end tests, with the application's data and cache directories in a temporary folder of the
// test file's own (the host and the backend read XDG_DATA_HOME and XDG_CACHE_HOME). The application keeps its settings
// there, so a test never reads or changes the settings of the machine it runs on, and one file's choices are not
// another's. Every app a file launches shares that folder (a restart of the app in the same file sees what the first run
// kept); the folder goes when the file's process does.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The folder of this file's run. */
export const home = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))

process.env.XDG_DATA_HOME = join(home, 'data')
process.env.XDG_CACHE_HOME = join(home, 'cache')
process.once('exit', () => rmSync(home, { recursive: true, force: true }))

export { type E2eApp, launchApp } from 'pico-desktop'
