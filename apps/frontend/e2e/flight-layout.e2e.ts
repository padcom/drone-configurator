// End to end, in the real window: the layout of the Flight data screen is kept. A bar moved and a pane collapsed are as they
// were left after the application is closed and started again. The settings are in a temporary folder (launch.ts).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'

const APP_ID = 'dev.pico-desktop.drone-configurator'
const FILE = join(home, 'data', 'pico-desktop', 'apps', APP_ID, 'settings.json')

/**
 * The size of a bar's first pane, as the page says it (what a screen reader is told).
 *
 * @param app the app
 * @param bar which bar: 0 between the map and the rest, 1 between the display and the details
 * @returns percent
 */
function sizeOf(app: E2eApp, bar: number): Promise<number> {
  return app.evaluate<number>(`Number(document.querySelectorAll('[role="separator"]')[${bar}].getAttribute('aria-valuenow'))`)
}

/**
 * Presses a key on a bar (the driver's `press` has no arrow keys).
 *
 * @param app the app
 * @param bar which bar
 * @param key the key
 */
async function keyOnBar(app: E2eApp, bar: number, key: string): Promise<void> {
  await app.evaluate(`(() => { const bar = document.querySelectorAll('[role="separator"]')[${bar}]; bar.focus();
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true })) })()`)
}

/**
 * The share of the width that the settings file keeps for the map, if it keeps a layout (the entry is JSON in JSON: it is
 * read, not matched as text, so that 5 is not taken for 50 or 55).
 *
 * @returns percent, or undefined
 */
function keptMain(): number | undefined {
  if (!existsSync(FILE)) {
    return undefined
  }
  const entries = (JSON.parse(readFileSync(FILE, 'utf8')) as { ui: { key: string, value: string }[] }).ui
  const text = entries.find(entry => entry.key === 'layout.flightData')?.value

  return text === undefined ? undefined : (JSON.parse(text) as { main: number }).main
}

it('keeps the layout of the Flight data screen across a restart of the application', async () => {
  const first = await launchApp()
  await first.waitForText('#connection', 'disconnected')
  await showScreen(first, 'flight')
  await keyOnBar(first, 1, 'ArrowDown')
  await first.click('button[title="Collapse Map"]')
  await first.waitFor(`document.querySelector('button[title="Expand Map"]') !== null`)
  expect(await sizeOf(first, 1)).toBe(45)
  // Kept a moment after the last change, once the backend has written the file.
  await vi.waitFor(() => expect(keptMain()).toBe(5), { timeout: 10_000, interval: 100 })
  expect(await first.close()).toBe(0)

  const second = await launchApp()
  await second.waitForText('#connection', 'disconnected')
  await showScreen(second, 'flight')
  await second.waitFor(`document.querySelector('button[title="Expand Map"]') !== null`, 20_000)
  expect(await sizeOf(second, 1)).toBe(45)
  await second.click('button[title="Expand Map"]')
  await second.waitFor(`document.querySelector('button[title="Collapse Map"]') !== null`)
  expect(await sizeOf(second, 0)).toBe(60)
  expect(await second.close()).toBe(0)
}, 120_000)
