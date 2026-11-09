// End to end, in the real window: the Flight data screen with a vehicle connected (the built-in simulator). It has its
// panes with the telemetry in the details, F6 moves the focus from pane to pane, and switching to it and away from it is
// quick while the vehicle's values arrive.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { SWITCH_LIMIT_MS, switchRounds } from './switch'

let app: E2eApp

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 30_000)
  // Each screen is loaded when it is first shown: both are, so that the switches below are between loaded ones.
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters$/u, 30_000)
  await showScreen(app, 'flight')
})

afterAll(async () => {
  await app?.close()
})

/**
 * The name of the pane that has the focus, or what else has it.
 *
 * @returns `Map`, `Display` or `Details`; or the tag of what has the focus
 */
function focused(): Promise<string> {
  return app.evaluate<string>(`(() => {
    const active = document.activeElement
    const title = active && active.classList.contains('flight-pane') ? active.querySelector('h2').textContent : null
    return title ?? (active ? active.tagName : 'nothing')
  })()`)
}

/**
 * Presses Shift+F6 (the driver's `press` has no Shift): the key event reaches the window as the keyboard's does.
 */
async function shiftF6(): Promise<void> {
  await app.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true, cancelable: true }))`,
  )
}

describe('the panes of the Flight data screen, with a vehicle connected', () => {
  it('has a map, a display and details, and the vehicle telemetry is in the details', async () => {
    const titles = await app.evaluate<string[]>(`[...document.querySelectorAll('.flight-pane h2')].map(h => h.textContent)`)
    const telemetry = await app.waitForText('[role="tabpanel"] #telemetry', /Battery\s*\d/u, 30_000)

    expect(titles).toEqual(['Map', 'Display', 'Details'])
    expect(telemetry).toMatch(/Mode\s*\S+/u)
  })
})

describe('the keys of the Flight data screen, with a vehicle connected', () => {
  it('moves the focus from pane to pane with F6, through the host, and round to the first', async () => {
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      await app.press('F6')
      // eslint-disable-next-line no-await-in-loop
      seen.push(await focused())
    }

    expect(seen).toEqual(['Map', 'Display', 'Details', 'Map'])
  })

  it('goes back with Shift+F6, and Tab from a pane goes on into it', async () => {
    await shiftF6()
    expect(await focused()).toBe('Details')
    await shiftF6()
    expect(await focused()).toBe('Display')
    await app.press('Tab')

    expect(await app.evaluate<string>('document.activeElement.tagName')).toBe('BUTTON')
  })
})

describe('switching screens, with a vehicle connected', () => {
  it('switches to a screen that has been shown before within 100 ms, also while the values arrive', async () => {
    const times = await switchRounds(app)
    console.info('screen switch times with a vehicle connected (ms):', JSON.stringify(times))

    expect(Math.max(...Object.values(times))).toBeLessThan(SWITCH_LIMIT_MS)
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
