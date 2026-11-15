// End to end, in the real window with the real backend and a fake tile server on this computer (no vehicle, no real tile server
// is ever contacted): the map of the Flight data screen. The credit of OpenStreetMap is on the map as a link, and stays when
// the tiles are off; tiles are asked of the backend (with the project's User-Agent) for what is on screen, drawn on the canvas,
// and asked for again after a zoom; the keys and the buttons move and zoom the map; offline mode asks the server for nothing
// and says why a tile is missing; and nothing scrolls but the aside (the map is panned, the page has no scrollbar).
import { mkdirSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'

/** A 1x1 grey PNG: what the fake server gives for every tile. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let app: E2eApp
let server: Server
/** Where the fake server listens. */
const where = { port: 0 }
const asked: { path: string, agent: string }[] = []

/**
 * The settings of a user who turned the tiles off, before the app starts (it starts on the Flight data screen: no tile is
 * ever asked of a real server). The source stays the built-in one until the test chooses the fake server, tiles still off.
 */
function turnTilesOff(): void {
  const folder = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')
  mkdirSync(folder, { recursive: true })
  const document = { version: 1, ui: [{ key: 'map.enabled', value: 'false' }] }
  writeFileSync(join(folder, 'settings.json'), `${JSON.stringify(document)}\n`)
}

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

beforeAll(async () => {
  server = createServer((request, response) => {
    asked.push({ path: request.url ?? '', agent: String(request.headers['user-agent'] ?? '') })
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=86400' })
    response.end(PNG)
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  where.port = (server.address() as AddressInfo).port
  turnTilesOff()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('#map-enabled') !== null`, 60_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    server?.close()
  }
})

/**
 * Chooses the fake server as the source of the tiles, on the Settings screen (the tiles are off while it is done).
 */
async function chooseTheFakeServer(): Promise<void> {
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('#map-enabled') !== null`, 30_000)
  await change('.settings-map select[id$="-source"]', 'custom')
  await change('.settings-map input[type="text"]', `http://127.0.0.1:${where.port}/{z}/{x}/{y}.png`)
  await app.waitFor(`document.querySelector('#map-url-error') === null`, 30_000)
}

/**
 * Whether a switch of Settings is on.
 *
 * @param id the switch
 * @returns true when it is
 */
function isOn(id: string): Promise<boolean> {
  return app.evaluate<boolean>(`document.querySelector('#${id}').getAttribute('aria-checked') === 'true'`)
}

/**
 * Puts a switch of Settings on or off.
 *
 * @param id the switch
 * @param on what it is to be
 */
async function turn(id: string, on: boolean): Promise<void> {
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('#${id}') !== null`, 30_000)

  if ((await isOn(id)) !== on) {
    await app.click(`#${id}`)
  }

  await app.waitFor(`document.querySelector('#${id}').getAttribute('aria-checked') === '${on}'`, 10_000)
}

/**
 * What the map says of its view.
 *
 * @returns the zoom, latitude and longitude
 */
function viewOf(): Promise<{ zoom: number, lat: number, lon: number }> {
  return app.evaluate(`(() => {
    const box = document.querySelector('.map')
    return { zoom: Number(box.dataset.zoom), lat: Number(box.dataset.lat), lon: Number(box.dataset.lon) }
  })()`)
}

/**
 * Whether the fake server was asked for a tile of a zoom.
 *
 * @param zoom the zoom
 * @returns true when it was
 */
function askedAt(zoom: number): boolean {
  return asked.some(one => one.path.startsWith(`/${zoom}/`))
}

/** Whether the canvas has a pixel that was drawn (a tile of the fake server is grey and opaque). */
const PAINTED = `(() => {
  const canvas = document.querySelector('.map-canvas')
  if (!canvas || canvas.width === 0) return false
  const context = canvas.getContext('2d')
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  return data.some((value, i) => i % 4 === 3 && value > 0)
})()`

it('credits OpenStreetMap on the map as a link, and keeps it when the tiles are off, and says they are', async () => {
  await showScreen(app, 'flight')
  await app.waitFor(`document.querySelector('.map') !== null`, 30_000)

  expect(await app.text('#map-attribution')).toBe('© OpenStreetMap contributors')
  const link = `document.querySelector('#map-attribution')`

  expect(await app.evaluate<string>(`${link}.href`)).toBe('https://www.openstreetmap.org/copyright')
  expect(await app.evaluate<string>(`${link}.target`)).toBe('_blank')
  expect(await app.evaluate<boolean>(`document.querySelector('.map').contains(${link})`)).toBe(true)
  await app.waitFor(`document.querySelector('#map-chip')?.textContent.includes('switched off')`, 10_000)
  expect(asked).toHaveLength(0)
})

it('asks the backend for the tiles of the screen, which asks the server with its User-Agent, and draws them', async () => {
  await chooseTheFakeServer()
  await turn('map-enabled', true)
  await showScreen(app, 'flight')
  await app.waitFor(`document.querySelector('.map') !== null`, 30_000)
  await app.waitFor(PAINTED, 60_000)

  // (the backend spaces its asks of a server: the screen's tiles come one after the other)
  await vi.waitFor(() => expect(asked.length).toBeGreaterThan(3), { timeout: 30_000 })
  expect(asked.every(one => /^\/\d+\/\d+\/\d+\.png$/u.test(one.path))).toBe(true)
  expect(asked.every(one => one.agent.startsWith('DroneConfigurator/'))).toBe(true)
  expect(await app.evaluate<string>(`document.querySelector('#map-chip')?.textContent ?? ''`)).toBe('')
})

it('zooms with the button and the keys, moves with the arrows, and asks for the tiles of the new zoom', async () => {
  const before = await viewOf()
  await app.click('#map-zoom-in')
  await app.waitFor(`document.querySelector('.map').dataset.zoom === '${before.zoom + 1}'`, 10_000)
  await vi.waitFor(() => expect(askedAt(before.zoom + 1)).toBe(true), { timeout: 30_000 })
  await app.evaluate(`document.querySelector('.map').focus()`)
  await app.press('-')
  await app.waitFor(`document.querySelector('.map').dataset.zoom === '${before.zoom}'`, 10_000)
  const level = await viewOf()
  // (the host's keyboard has no arrows: the key is sent to the map as the page sees it)
  const arrow = `new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })`
  await app.evaluate(`document.querySelector('.map').dispatchEvent(${arrow})`)
  await app.waitFor(`Number(document.querySelector('.map').dataset.lon) > ${level.lon}`, 10_000)

  expect(await app.evaluate<boolean>(`document.activeElement === document.querySelector('.map')`)).toBe(true)
})

/**
 * A drag with the mouse, as the host sends it (real pointer events): press, move in steps, release.
 *
 * @param from where the pointer goes down
 * @param from.x the column
 * @param from.y the row
 * @param dx how far it moves to the right (px)
 */
async function drag(from: { x: number, y: number }, dx: number): Promise<void> {
  const mouse = (type: string, x: number, buttons: number) => app.devtools('Input.dispatchMouseEvent', {
    type, x, y: from.y, button: 'left', buttons, clickCount: 1,
  })
  await mouse('mousePressed', from.x, 1)

  for (const step of [0.25, 0.5, 0.75, 1]) {
    // eslint-disable-next-line no-await-in-loop -- the pointer moves a step at a time
    await mouse('mouseMoved', from.x + dx * step, 1)
  }
  await mouse('mouseReleased', from.x + dx, 0)
}

it('moves the view with a drag of the mouse, and asks for the tiles that came on screen', async () => {
  await app.click('#map-zoom-in')
  await app.click('#map-zoom-in')
  const before = await viewOf()
  const box = await app.evaluate<{ x: number, y: number }>(`(() => {
    const rect = document.querySelector('.map').getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  const count = asked.length
  await drag(box, -400)
  await app.waitFor(`Number(document.querySelector('.map').dataset.lon) > ${before.lon}`, 10_000)
  const after = await viewOf()

  expect(after.zoom).toBe(before.zoom)
  expect(after.lon).toBeGreaterThan(before.lon)
  // 400 px is more than a tile and a half: columns that were off screen are asked for
  await vi.waitFor(() => expect(asked.length).toBeGreaterThan(count), { timeout: 30_000 })
})

it('says why a tile is missing when it is offline, and asks the server for nothing', async () => {
  await turn('map-offline', true)
  await showScreen(app, 'flight')
  await app.waitFor(`document.querySelector('.map') !== null`, 30_000)
  const count = asked.length
  // a zoom that was never looked at: nothing of it is kept
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- one zoom after the other
    await app.click('#map-zoom-in')
  }
  await app.waitFor(`document.querySelector('#map-chip')?.textContent.includes('Offline')`, 30_000)

  expect(asked).toHaveLength(count)
})

it('has no scrollbar of the page or of the area: the map fills its place and is panned', async () => {
  const fits = await app.evaluate<boolean>(`(() => {
    const root = document.scrollingElement
    const area = document.querySelector('.app-main')
    const map = document.querySelector('.map').getBoundingClientRect()
    const place = document.querySelector('.fly-map').getBoundingClientRect()
    return root.scrollHeight <= window.innerHeight + 1 && area.scrollHeight <= area.clientHeight + 1
      && Math.abs(map.width - place.width) < 1 && Math.abs(map.height - place.height) < 1
  })()`)

  expect(fits).toBe(true)
})
