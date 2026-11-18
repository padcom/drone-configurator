// End to end, in the real window with the real backend, no vehicle and no radio: Settings > Remote control. A pad is shown to the
// page by replacing `navigator.getGamepads` (the window has none), so that the mapping and its rows are on the screen. What is
// checked is the layout rule: only the middle panel scrolls (the page, the rail and the top bar stay where they are), nothing
// reaches past the right edge of the column, and the last control is reachable, at 1440x768, 1000x700 and 999x700. And the
// rule that RC is off until the person turns it on: nothing here starts a control.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

let app: E2eApp | undefined

const SIZES = [{ width: 1440, height: 768 }, { width: 1000, height: 700 }, { width: 999, height: 700 }]

/** What the window's `navigator.getGamepads` says: a radio with eight axes and a few buttons, all at rest. */
const FAKE_PAD = `(() => {
  const pad = { id: 'E2E Radio (Vendor: 0000 Product: 0001)', index: 0, connected: true, axes: [0, 0, -1, 0, 0, 0, 0, 0] }
  pad.buttons = Array.from({ length: 6 }, () => ({ value: 0 }))
  navigator.getGamepads = () => [pad]
})()`

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

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('#rc-allow') !== null`, 60_000)
  await app.evaluate(FAKE_PAD)
  await app.waitFor(`document.querySelector('#rc-device-name') !== null`, 30_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

/** What the page looks like at one size. */
interface Probe {
  stacked: boolean
  pageScrolls: boolean
  sideways: string[]
  railMoved: boolean
  topMoved: boolean
  reachable: boolean
  rows: number
  free: number
}

/** The look at the page, made in the page: scrolls the area and the page to their ends, says what moved and what is in reach. */
const PROBE = `(async () => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const area = document.querySelector('.app-main')
    const rail = document.querySelector('.rail')
    const top = document.querySelector('#top-bar')
    // from the start: the page and the area are at their tops
    area.scrollTop = 0
    document.scrollingElement.scrollTop = 0
    await new Promise(resolve => requestAnimationFrame(resolve))
    const railBefore = rail.getBoundingClientRect().top
    const topBefore = top.getBoundingClientRect().top
    const column = document.querySelector('.settings').getBoundingClientRect()
    // under 1000 px the shell stacks the rail over the page (it ends where the area begins, and shares its columns)
    const railBox = rail.getBoundingClientRect()
    const areaBox = area.getBoundingClientRect()
    const stacked = railBox.bottom <= areaBox.top + 1 && railBox.right > areaBox.left + 1
    area.scrollTop = area.scrollHeight
    document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight
    await new Promise(resolve => requestAnimationFrame(resolve))
    const over = [...document.querySelectorAll('.settings-rc *')]
      .filter(element => element.getBoundingClientRect().right > column.right + 1)
      .slice(0, 4).map(element => element.tagName + '.' + element.className)
    // the last control of the section, once everything is scrolled to its end: in the window, and (from 1000 px) in the area
    const last = [...document.querySelectorAll('.settings-rc button, .settings-rc input, .settings-rc select')].at(-1)
    const at = last.getBoundingClientRect()
    const room = stacked ? window.innerHeight : area.getBoundingClientRect().bottom
    return {
      stacked,
      pageScrolls: document.scrollingElement.scrollHeight > window.innerHeight + 1,
      sideways: area.scrollWidth > area.clientWidth + 1 || document.scrollingElement.scrollWidth > window.innerWidth + 1
        ? ['area'].concat(over) : over,
      railMoved: Math.abs(rail.getBoundingClientRect().top - railBefore) > 1,
      topMoved: Math.abs(top.getBoundingClientRect().top - topBefore) > 1,
      reachable: at.top >= 0 && at.bottom <= room + 1,
      rows: document.querySelectorAll('.rc-row:not(.rc-free)').length,
      free: document.querySelectorAll('.rc-free').length,
    }
  })()`

/**
 * Looks at the Settings page at one size, after the area is scrolled to its end.
 *
 * @param size the window's size
 * @param size.width the width
 * @param size.height the height
 * @returns what it shows
 */
async function probe(size: { width: number, height: number }): Promise<Probe> {
  await window().devtools('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false })

  return window().evaluate<Probe>(PROBE)
}

it('shows the pad and the four sticks of its mapping, with remote control off', async () => {
  expect(await window().evaluate<string>(`document.querySelector('#rc-allow').getAttribute('aria-checked')`)).toBe('false')
  expect(await window().text('#rc-device-name')).toContain('E2E Radio')
  expect(await window().evaluate<number>(`document.querySelectorAll('.rc-row:not(.rc-free)').length`)).toBe(4)
  expect(await window().evaluate<number>(`document.querySelectorAll('.rc-free').length`)).toBe(12)
})

for (const size of SIZES) {
  it(`scrolls only the middle panel, with nothing past the column's edge, at ${size.width}x${size.height}`, async () => {
    const seen = await probe(size)

    expect([seen.rows, seen.free]).toEqual([4, 12])
    expect(seen.sideways).toEqual([])
    expect(seen.reachable).toBe(true)
    // From 1000 px only the middle panel scrolls: the page, the rail and the top bar stay. Under it the shell stacks the rail
    // over the page, and the page scrolls as one with them (it is too short for the section, so it does scroll).
    const { stacked, pageScrolls, railMoved, topMoved } = seen
    const expected = size.width < 1000
      ? { stacked: true, pageScrolls: true, railMoved: true, topMoved: true }
      : { stacked: false, pageScrolls: false, railMoved: false, topMoved: false }

    expect({ stacked, pageScrolls, railMoved, topMoved }).toEqual(expected)
  })
}

it('has the switch for the sticks that arm and disarm off, and shut until remote control is allowed', async () => {
  const state = (): Promise<string> => window().evaluate<string>(
    `document.querySelector('#rc-rudder-arm').getAttribute('aria-checked') + ' ' + document.querySelector('#rc-rudder-arm').disabled`,
  )

  expect(await state()).toBe('false true')
  await window().click('#rc-allow')
  await window().waitFor(`document.querySelector('#rc-rudder-arm').disabled === false`, 30_000)
  await window().click('#rc-rudder-arm')
  await window().waitFor(`document.querySelector('#rc-rudder-arm').getAttribute('aria-checked') === 'true'`, 30_000)
  // (turned over again, and the permission with it: the switch is not left on behind a shut one)
  await window().click('#rc-rudder-arm')
  await window().waitFor(`document.querySelector('#rc-rudder-arm').getAttribute('aria-checked') === 'false'`, 30_000)
  await window().click('#rc-allow')
  await window().waitFor(`document.querySelector('#rc-allow').getAttribute('aria-checked') === 'false'`, 30_000)
  expect(await state()).toBe('false true')
})

it('starts no control by itself: turning the setting on only allows it', async () => {
  await window().click('#rc-allow')
  await window().waitFor(`document.querySelector('#rc-allow').getAttribute('aria-checked') === 'true'`, 30_000)
  expect(await window().text('#rc-status')).toBe('No simulator is connected.')
  await window().click('#rc-allow')
  await window().waitFor(`document.querySelector('#rc-allow').getAttribute('aria-checked') === 'false'`, 30_000)
})
