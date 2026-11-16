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

/** What the status of the empty list is, in the window: its display (not `none`: it would not be in the tree) and its height. */
const STATUS = `(() => {
  const status = document.querySelector('.messages .empty')
  const style = getComputedStyle(status)
  return { role: status.getAttribute('role'), display: style.display, height: Math.round(status.getBoundingClientRect().height) }
})()`

it('has the status of an empty list rendered all the time, with no room while it says nothing', async () => {
  const seen = await window().evaluate<{ role: string, display: string, height: number }>(STATUS)

  expect(seen).toEqual({ role: 'status', display: 'block', height: 0 })
})

it('empties with Clear and says so', async () => {
  await resize(1280, 720)
  await window().click('.messages-clear')
  await window().waitFor(`document.querySelectorAll('.message').length === 0`)
  const after = await window().evaluate<{ display: string, height: number }>(STATUS)

  expect(after.display).toBe('block')
  expect(after.height).toBeGreaterThan(0)

  expect(await window().text('.messages')).toContain('The vehicle has said nothing yet.')
})

/** The keys that press a button, as the host receives them: with the text they type (Enter is a carriage return). */
const BUTTON_KEYS = {
  Enter: { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r' },
  Space: { windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ' },
  Tab: { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' },
} as const

/**
 * Presses a key: the key goes down (with its text, as a typed key has) and comes up.
 *
 * @param name the key
 */
async function pressKey(name: keyof typeof BUTTON_KEYS): Promise<void> {
  const event = BUTTON_KEYS[name]
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/** Brings the messages back: the vehicle is disconnected and connected again, and says what it says when it comes. */
async function messagesAreBack(): Promise<void> {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', /^disconnected/u)
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 60_000)
  await showScreen(window(), 'flight')
  await window().waitFor(`document.querySelectorAll('.message').length > 0`, 60_000)
}

/**
 * Presses a key on the focused Clear button, and says what came of it: the rows left, what has the focus, and what the focus is
 * after Tab.
 *
 * @param name the key that presses the button
 * @returns what was seen
 */
async function clearWithKey(name: 'Enter' | 'Space'): Promise<{ rows: number, focus: string, afterTab: string }> {
  await window().evaluate(`document.querySelector('.messages-clear').focus()`)
  await pressKey(name)
  await window().waitFor(`document.querySelectorAll('.message').length === 0`, 10_000)
  const where = `document.activeElement === document.querySelector('.messages') ? 'section' : document.activeElement?.tagName`
  const focus = await window().evaluate<string>(where)
  await pressKey('Tab')
  const afterTab = await window().evaluate<string>(where)

  return { rows: await window().evaluate<number>(`document.querySelectorAll('.message').length`), focus, afterTab }
}

it('empties with Enter on the focused Clear button, and keeps the focus in the section, and Tab moves on', async () => {
  await messagesAreBack()
  const seen = await clearWithKey('Enter')

  expect(seen.rows).toBe(0)
  expect(seen.focus).toBe('section')
  expect(seen.afterTab).not.toBe('section')
}, 120_000)

it('empties with Space on the focused Clear button, and keeps the focus in the section, and Tab moves on', async () => {
  await messagesAreBack()
  const seen = await clearWithKey('Space')

  expect(seen.rows).toBe(0)
  expect(seen.focus).toBe('section')
  expect(seen.afterTab).not.toBe('section')
}, 120_000)
