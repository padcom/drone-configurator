// End to end, in the real window with the real backend and a simulated vehicle behind a TCP port whose pre-arm check FAILS (it
// prints "PreArm: Compasses inconsistent" and refuses to arm): the review lists the vehicle's own words; a refused arm says why
// in a notice that never covers the strip's controls (tested at 1000 and 999 px, where the layout changes); and the mode menu
// sends nothing when keys move over it: a mode is asked for only by choosing its item.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { ARM_BUTTON, MODE_BUTTON, MODE_ITEMS, REVIEW, sleep, Strip } from './strip'
import { TcpVehicle } from './tcp-vehicle'

const TEXT = 'Compasses inconsistent'

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
 * What the tests do in the window.
 *
 * @returns the helpers
 */
function strip(): Strip {
  return new Strip(window())
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true, TEXT)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('lists the vehicle\'s own words in the review', async () => {
  await strip().heartbeatSays(false)
  await window().click(REVIEW)
  await strip().appears('#review-state')
  await strip().reviewIsReady()
  const first = `document.querySelector('#review-reasons .review-text')`
  await window().waitFor(`${first}?.innerText.includes('${TEXT}') === true`, 15_000)

  const all = `[...document.querySelectorAll('#review-reasons .review-text')]`
  const texts = await window().evaluate<string[]>(`${all}.map(e => e.innerText)`)

  expect(texts.some(text => text.includes(`PreArm: ${TEXT}`))).toBe(true)
})

/**
 * Holds the arm: the vehicle refuses it.
 */
async function askToArm(): Promise<void> {
  await window().click(ARM_BUTTON)
  await strip().hold()
}

it('says why an arm was refused, and stays disarmed', async () => {
  await askToArm()
  await window().waitFor(`document.body.innerText.includes('refused to arm')`, 15_000)

  const toasts = `[...document.querySelectorAll('.kit-toast')]`
  const said = await window().evaluate<string>(`${toasts}.map(e => e.innerText).join(' | ')`)

  expect(said).toContain('refused to arm')
  expect(said).toContain(TEXT)
  expect(await strip().exists(REVIEW)).toBe(true)
})

/**
 * Whether the controls of the strip are free of notices at a size of the window: no notice overlaps one, and what is at the
 * centre of each is the control itself.
 *
 * @param width the window's width
 * @param height the window's height
 * @returns what overlaps, or the empty text
 */
async function coveredAt(width: number, height: number): Promise<string> {
  await window().devtools('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await sleep(300)

  return window().evaluate<string>(`(() => {
    const toasts = [...document.querySelectorAll('.kit-toast')].map(e => e.getBoundingClientRect())
    const controls = [...document.querySelectorAll('#flight-strip button, #flight-strip [role="button"]')]
    const covered = []
    for (const control of controls) {
      const r = control.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const overlaps = toasts.some(t => t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top)
      const reached = hit === control || control.contains(hit)
      if (r.width > 0 && (overlaps || !reached)) covered.push(control.innerText.trim() || control.id)
    }
    return covered.join(', ')
  })()`)
}

/** Makes sure there is a notice on the page (a refused arm makes one). */
async function withANotice(): Promise<void> {
  if (!await strip().exists('.kit-toast')) {
    await askToArm()
  }
  await strip().appears('.kit-toast', 15_000)
}

it.each([[1440, 900], [1000, 700], [999, 700], [1000, 500]])(
  'never lets a notice cover the strip\'s controls at %i x %i',
  async (width, height) => {
    await withANotice()
    // (an arm may have been asked for: the review is then closed again by the arm)
    expect(await coveredAt(width, height), `${width}x${height}`).toBe('')
  },
)

/** A real ArrowDown key, as the keyboard sends it (the app's `press` knows no arrow keys). */
async function arrowDown(): Promise<void> {
  const key = { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 }

  await window().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

it('sends nothing when keys move over the mode menu, and sends the mode of the item that is chosen', async () => {
  await window().waitFor(`document.querySelector('${MODE_BUTTON}')?.innerText.startsWith('Mode: ')`, 30_000)
  const before = await window().text(MODE_BUTTON)

  await window().evaluate(`document.querySelector('${MODE_BUTTON}').focus()`)
  await arrowDown()
  await window().waitFor(`document.querySelectorAll('${MODE_ITEMS}').length > 5`, 10_000)
  await arrowDown()
  await arrowDown()
  await window().press('Escape')
  // (a mode that was asked for shows in the next heartbeats)
  await sleep(2500)

  expect(await window().text(MODE_BUTTON)).toBe(before)

  await window().click(MODE_BUTTON)
  await window().waitFor(`document.querySelectorAll('${MODE_ITEMS}').length > 5`, 10_000)
  const items = `[...document.querySelectorAll('${MODE_ITEMS}')]`
  await window().evaluate(`${items}.find(o => o.innerText.startsWith('AUTO')).click()`)
  await strip().modeIs('AUTO')
})
