// End to end, in the real window: the settings. A theme chosen with the switch is still there after the application is
// closed and started again. The application's data and cache directories are a temporary folder's, so nothing of the
// machine's own settings is read or changed.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from 'pico-desktop'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { chooseTheme } from './click'

const APP_ID = 'dev.pico-desktop.drone-configurator'
const DARK = `document.documentElement.getAttribute('data-theme') === 'dark'`

let home = ''

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'drone-configurator-settings-'))
  process.env.XDG_DATA_HOME = join(home, 'data')
  process.env.XDG_CACHE_HOME = join(home, 'cache')
})

afterAll(() => {
  delete process.env.XDG_DATA_HOME
  delete process.env.XDG_CACHE_HOME
  rmSync(home, { recursive: true, force: true })
})

it('keeps the theme chosen with the switch across a restart of the application', async () => {
  const file = join(home, 'data', 'pico-desktop', 'apps', APP_ID, 'settings.json')
  const first = await launchApp()
  await first.waitForText('#connection', 'disconnected')
  await chooseTheme(first, 'dark')
  // The page shows it at once; it is kept once the backend has written the file.
  await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 10_000, interval: 100 })
  expect(await first.close()).toBe(0)

  const second = await launchApp()
  await second.waitFor(DARK, 20_000)
  expect(await second.evaluate<string>(`document.querySelector('#theme-switch input:checked').value`)).toBe('dark')
  expect(await second.close()).toBe(0)
}, 120_000)
