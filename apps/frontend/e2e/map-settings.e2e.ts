// End to end, in the real window with the real backend, no vehicle: Settings > Map. The switches and the source are entries of
// the settings document, which the backend reads when it is asked for a tile, and what the backend makes of them comes back in
// `map.sources`
// (the host of a custom address, why one cannot be used, the cache). No tile is asked for, and no tile server is contacted: this
// test only changes settings and clears an empty cache. Not covered: a tile fetched through the window (the backend tests have a
// local fake tile server for that; flight-map.e2e.ts brings one to a window). The e2e app starts with the tiles OFF (launch.ts), so
// that the map of the Flight data screen that the app starts on asks no real tile server; this test turns them on while the
// Settings screen is shown (the map of a screen that is not shown asks for nothing).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

let app: E2eApp

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('#map-enabled') !== null`, 60_000)
  await app.click('#map-enabled')
  await app.waitFor(`document.querySelector('#map-enabled').getAttribute('aria-checked') === 'true'`, 30_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

/**
 * Sets a field of the page and says it changed, as typing and leaving it does.
 *
 * @param selector the field
 * @param value what it holds
 */
async function change(selector: string, value: string): Promise<void> {
  await app.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)})
    field.value = ${JSON.stringify(value)}
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

it('says, with the tiles on and online, what the tile server is told', async () => {
  expect(await app.evaluate<string>(`document.querySelector('#map-enabled').getAttribute('aria-checked')`)).toBe('true')
  expect(await app.evaluate<string>(`document.querySelector('#map-offline').getAttribute('aria-checked')`)).toBe('false')
  expect(await app.text('#map-state')).toContain('loaded from the internet')
  expect(await app.text('#map-privacy')).toContain('DroneConfigurator/0.1.0 (+https://github.com/padcom/drone-configurator)')
  await app.waitFor(`document.querySelector('#map-cache-used')?.textContent.includes('The cache holds')`, 30_000)
})

it('keeps what is chosen: offline mode and the tiles turned off, each said in words', async () => {
  await app.click('#map-offline')
  await app.waitFor(`document.querySelector('#map-state').textContent.includes('only the tiles that were kept')`, 30_000)
  await app.click('#map-enabled')
  await app.waitFor(`document.querySelector('#map-state').textContent.includes('nothing is asked of a tile server')`, 30_000)
  await app.click('#map-enabled')
  await app.click('#map-offline')
  await app.waitFor(`document.querySelector('#map-state').textContent.includes('loaded from the internet')`, 30_000)
})

it('shows only the host of a custom address, and says why an address cannot be used', async () => {
  await change('.settings-map select[id$="-source"]', 'custom')
  await app.waitFor(`document.querySelector('#map-url-error') !== null`, 30_000)
  expect(await app.text('#map-url-error')).toContain('no address is set')

  await change('.settings-map input[type="text"]', 'https://tiles.example.com/maps/{z}/{x}/{y}.png?key=SECRET')
  await app.waitFor(`document.querySelector('#map-url-error') === null`, 30_000)
  const shown = await app.text('.settings-map')
  expect(shown).toContain('tiles.example.com')
  expect(shown.includes('SECRET')).toBe(false)

  await change('.settings-map input[type="text"]', 'https://user:SECRET@tiles.example.com/{z}/{x}/{y}.png')
  await app.waitFor(`document.querySelector('#map-url-error') !== null`, 30_000)
  const problem = await app.text('#map-url-error')
  expect(problem).toContain('user name or a password')
  expect(problem.includes('SECRET')).toBe(false)
})

it('clears the cache (it is empty here) and says what went', async () => {
  await app.click('#map-clear')
  await app.waitFor(`document.querySelector('#map-cleared') !== null`, 30_000)
  expect(await app.text('#map-cleared')).toContain('0 tiles removed')
})
