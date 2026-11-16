// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port: the messages list of the Fly
// aside. It is a log; every message has its severity in a word; Clear empties it; and the layout rule holds: from 1000 px only
// the list scrolls (the display and the cards of the aside stay where they are, the area and the page have no scrollbar), and
// below that the list has a height of its own and the page scrolls as a page does. (The list is made long by copying its rows in
// the page: the layout is what is looked at, not what the vehicle says.)
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

let vehicle: TcpVehicle | undefined
let app: E2eApp | undefined

/**
 * The app under test.
 *
 * @returns the app
 * @throws {Error} before it has started
 */
function window(): E2eApp {
  if (!app) {
    throw new Error('the app has not started')
  }

  return app
}

/**
 * Sets the size of the window's page.
 *
 * @param width the width
 * @param height the height
 */
async function resize(width: number, height: number): Promise<void> {
  await window().devtools('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  await app.waitFor(`document.querySelectorAll('.message').length > 0`, 60_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

/** What the page shows when the list is moved. */
interface Probe {
  listScrolls: boolean
  listMoved: boolean
  hudMoved: number
  areaScrolls: boolean
  pageScrolls: boolean
  listHeight: number
  windowHeight: number
}

/**
 * The expression that makes the list long, moves it and says what moved.
 *
 * @returns JavaScript
 */
function probe(): string {
  return `(async () => {
    const list = document.querySelector('.message-list')
    const rows = [...list.children]
    while (list.children.length < 150) list.append(rows[0].cloneNode(true))
    await new Promise(resolve => setTimeout(resolve, 400))
    const hud = document.querySelector('.fly-aside .hud') ?? document.querySelector('.fly-aside > *')
    const area = document.querySelector('.app-main')
    const root = document.scrollingElement
    const before = Math.round(hud.getBoundingClientRect().top)
    list.scrollTop = 400
    await new Promise(resolve => requestAnimationFrame(resolve))
    return {
      listScrolls: list.scrollHeight > list.clientHeight + 1,
      listMoved: list.scrollTop > 0,
      hudMoved: Math.round(hud.getBoundingClientRect().top) - before,
      areaScrolls: area.scrollHeight > area.clientHeight + 1,
      pageScrolls: root.scrollHeight > window.innerHeight + 1,
      listHeight: Math.round(list.getBoundingClientRect().height),
      windowHeight: window.innerHeight,
    }
  })()`
}

it('is a log with the severity of every message in a word', async () => {
  expect(await window().evaluate<string>(`document.querySelector('.message-list').getAttribute('role')`)).toBe('log')
  const word = `row => row.querySelector('.sev')?.textContent.trim() !== ''`
  const everyHasSeverity = `[...document.querySelectorAll('.message')].every(${word})`

  expect(await window().evaluate<boolean>(everyHasSeverity)).toBe(true)
})

for (const [width, height] of [[1440, 768], [1280, 720], [1000, 700]] as const) {
  it(`scrolls only the list, the display and the cards stay, at ${width}x${height}`, async () => {
    await resize(width, height)
    const seen = await window().evaluate<Probe>(probe())

    expect(seen).toMatchObject({ listScrolls: true, listMoved: true, hudMoved: 0, areaScrolls: false, pageScrolls: false })
  }, 60_000)
}

it('gives the list a height of its own and lets the page scroll, at 999 px wide', async () => {
  await resize(999, 700)
  const seen = await window().evaluate<Probe>(probe())

  expect(seen.listScrolls).toBe(true)
  expect(seen.listMoved).toBe(true)
  // (20 rem at most: the list is not as tall as the window)
  expect(seen.listHeight).toBeLessThanOrEqual(330)
}, 60_000)

it('empties with Clear and says so', async () => {
  await resize(1280, 720)
  await window().click('.messages-clear')
  await window().waitFor(`document.querySelectorAll('.message').length === 0`)

  expect(await window().text('.messages')).toContain('The vehicle has said nothing yet.')
})
