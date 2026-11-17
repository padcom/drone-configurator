// End to end, in the real window with no vehicle (the plan is offline): the Plan page. An item is added with the button of the
// list, edited in the form and taken back with Undo; the palette's commands work on the page; and the scrolling rule holds: from
// 1000 px wide only the aside (the list and the form) scrolls and the route stays where it is, the area and the page have no
// scrollbar; below that the page stacks and scrolls as a whole.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { openPalette, chord } from './palette-keys'

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

/** The rows of the list of items, as text. */
const ROWS = `[...document.querySelectorAll('.plan-item')].map(row => row.innerText.replace(/\\s+/gu, ' ').trim())`

/**
 * Waits until the list has this many items.
 *
 * @param count how many
 */
async function waitForItems(count: number): Promise<void> {
  await window().waitFor(`document.querySelectorAll('.plan-item').length === ${count}`, 15_000)
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

/** Clicks the plan's map with a real mouse, a little off its middle (where the plan's first place is). */
async function clickTheMap(): Promise<void> {
  const middle = await window().evaluate<{ x: number, y: number }>(`(() => {
    const box = document.querySelector('.plan-map .map').getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  const at = { x: Math.round(middle.x + 90), y: Math.round(middle.y + 70) }
  const mouse = { ...at, button: 'left', buttons: 1, clickCount: 1 }
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse, buttons: 0 })
}

/** The place of the last pin of the map, as its pin says it. */
const LAST_PIN_PLACE = `(() => {
  const pin = [...document.querySelectorAll('.plan-pin[data-pin]')].at(-1)
  return pin.dataset.lat + ' ' + pin.dataset.lon
})()`

/** What the plan's map shows: where it is and how close, as the map says it. */
const MAP_VIEW = `(() => {
  const map = document.querySelector('.plan-map .map')
  return map.dataset.lat + ' ' + map.dataset.lon + ' ' + map.dataset.zoom
})()`

/**
 * Takes the last pin of the map with a real mouse and goes some pixels with it, in steps, and lets go.
 *
 * @param dx pixels to the right
 * @param dy pixels down
 */
async function dragLastPin(dx: number, dy: number): Promise<void> {
  const middle = await window().evaluate<{ x: number, y: number }>(`(() => {
    const box = [...document.querySelectorAll('.plan-pin[data-pin]')].at(-1).getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  const at = (by: number): { x: number, y: number } => ({ x: Math.round(middle.x + dx * by), y: Math.round(middle.y + dy * by) })
  const mouse = (by: number, buttons: number): object => ({ ...at(by), button: 'left', buttons, clickCount: 1 })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at(0) })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse(0, 1) })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...mouse(0.5, 1) })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...mouse(1, 1) })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse(1, 0) })
}

/** Presses Escape with a real key. */
async function pressEscape(): Promise<void> {
  const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  await window().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'plan')
  await app.waitFor(`document.querySelector('.plan-list') !== null`, 30_000)
}, 120_000)

afterAll(async () => {
  await app?.close()
})

describe('editing the plan', () => {
  it('starts empty, adds a waypoint with the list button, and changes its altitude in the form', async () => {
    expect(await window().text('.plan-list')).toContain('No items yet')
    await window().click('[data-command-button="plan.addWaypoint"]')
    await waitForItems(1)

    expect(await window().evaluate<string[]>(ROWS)).toEqual(['1 Waypoint 20 m'])
    await window().fill('#plan-alt', '35')
    await window().waitFor(`${ROWS}[0] === '1 Waypoint 35 m'`)
  })

  it('takes the change back with Undo and does it again with Redo', async () => {
    await window().click('[data-command-button="plan.undo"]')
    await window().waitFor(`${ROWS}[0] === '1 Waypoint 20 m'`)
    await window().click('[data-command-button="plan.redo"]')
    await window().waitFor(`${ROWS}[0] === '1 Waypoint 35 m'`)
  })

  it('runs the palette\'s commands on the page: Duplicate the item puts a copy after it', async () => {
    await openPalette(window())
    await window().fill('#palette-input', 'duplicate')
    await window().waitFor(`document.querySelector('.palette-row')?.dataset.command === 'plan.duplicate'`)
    await chord(window(), 'Enter')
    await waitForItems(2)

    expect(await window().evaluate<string[]>(ROWS)).toEqual(['1 Waypoint 35 m', '2 Waypoint 35 m'])
  })
})

describe('the plan on the map', () => {
  it('puts an item on the map when it has a place, and selects the item from its pin', async () => {
    // (nothing has a place yet: the map is there, with no pin)
    expect(await window().evaluate<number>(`document.querySelectorAll('.plan-pin').length`)).toBe(0)
    expect(await window().evaluate<boolean>(`document.querySelector('.plan-map .map-canvas') !== null`)).toBe(true)
    await window().fill('#plan-lat', '52.2297')
    await window().fill('#plan-lon', '21.0122')
    await window().waitFor(`document.querySelectorAll('.plan-pin').length === 1`)

    expect(await window().evaluate<string>(`document.querySelector('.plan-pin').textContent.trim()`)).toBe('2')
    await window().click('.plan-item')
    await window().waitFor(`document.querySelector('#plan-detail-title')?.textContent === 'Item 1: Waypoint'`)
    await window().click('.plan-pin')
    await window().waitFor(`document.querySelector('#plan-detail-title')?.textContent === 'Item 2: Waypoint'`)
  })

  it('adds a waypoint where the real map is clicked while the mode is on, and not when it is off', async () => {
    await clickTheMap()
    // (nothing is added: given a moment to be wrong)
    await window().evaluate(`new Promise(resolve => setTimeout(resolve, 300))`)
    expect(await window().evaluate<number>(`document.querySelectorAll('.plan-item').length`)).toBe(2)
    await window().click('#plan-add-on-map')
    await clickTheMap()
    await waitForItems(3)

    expect(await window().evaluate<number>(`document.querySelectorAll('.plan-pin').length`)).toBe(2)
    await pressEscape()
    await window().waitFor(`document.querySelector('#plan-add-on-map').getAttribute('aria-pressed') === 'false'`)
  })
})

describe('dragging on the map', () => {
  it('drags a pin with a real mouse in one step, and the map stays where it is; Undo takes it back', async () => {
    const before = await window().evaluate<string>(LAST_PIN_PLACE)
    const view = await window().evaluate<string>(MAP_VIEW)
    await dragLastPin(60, 40)
    await window().waitFor(`${LAST_PIN_PLACE} !== ${JSON.stringify(before)}`)

    expect(await window().evaluate<string>(MAP_VIEW)).toBe(view)
    await window().click('[data-command-button="plan.undo"]')
    await window().waitFor(`${LAST_PIN_PLACE} === ${JSON.stringify(before)}`)
  })
})

/** What the page shows when the aside is moved. */
interface Probe {
  asideOverflow: string
  asideScrolls: boolean
  asideMoved: boolean
  mainMoved: number
  areaScrolls: boolean
  pageScrolls: boolean
  below: string[]
  heights: string
}

/**
 * The expression that moves the aside and says what moved.
 *
 * @returns JavaScript
 */
function probe(): string {
  return `(async () => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const aside = document.querySelector('.plan-aside')
    const main = document.querySelector('.plan-main')
    const area = document.querySelector('.app-main')
    const root = document.scrollingElement
    const top = element => Math.round(element.getBoundingClientRect().top)
    const before = top(main)
    aside.scrollTop = 300
    await new Promise(resolve => requestAnimationFrame(resolve))
    return {
      asideOverflow: getComputedStyle(aside).overflowY,
      asideScrolls: aside.scrollHeight > aside.clientHeight + 1,
      asideMoved: aside.scrollTop > 0,
      mainMoved: top(main) - before,
      areaScrolls: area.scrollHeight > area.clientHeight + 1,
      pageScrolls: root.scrollHeight > window.innerHeight + 1,
      below: [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().bottom > window.innerHeight + 1)
        .slice(0, 6)
        .map(element => element.tagName + '.' + element.className + ' ' + Math.round(element.getBoundingClientRect().bottom)),
      heights: [window.innerHeight, root.scrollHeight, area.clientHeight, area.scrollHeight].join(' '),
    }
  })()`
}

/** Puts enough items in the plan that its list is taller than any window of the sizes below. */
const FILL = `(async () => {
  const add = document.querySelector('[data-command-button="plan.addWaypoint"]')
  for (let i = 0; i < 30; i += 1) {
    add.click()
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
})()`

/** What a window of 1000 px or more shows: the aside scrolls and nothing else does. */
const ASIDE_ONLY = {
  asideOverflow: 'auto',
  asideScrolls: true,
  asideMoved: true,
  mainMoved: 0,
  areaScrolls: false,
  pageScrolls: false,
}

describe('the scrolling rule', () => {
  it('has a plan long enough to scroll', async () => {
    await resize(1280, 700)
    await window().evaluate(FILL)
    await waitForItems(33)
  })

  // (the sizes of the rule, and a short window: the map gives way down to a small one before anything but the aside scrolls)
  const SIZES: [number, number][] = [[1440, 768], [1280, 700], [1000, 700], [1100, 480]]

  for (const [width, height] of SIZES) {
    it(`scrolls only the aside, and the route stays, at ${width}x${height}`, async () => {
      await resize(width, height)
      const seen = await window().evaluate<Probe>(probe())

      const { below, heights, ...facts } = seen

      // (a failure says what is below the window, and the heights of the window, the page and the area with its content)
      expect(facts, `${below.join(' | ')} (${heights})`).toEqual(ASIDE_ONLY)
    }, 60_000)
  }

  it('stacks and scrolls the page as a whole, the aside not on its own, at 999 px wide', async () => {
    await resize(999, 700)
    const seen = await window().evaluate<Probe>(probe())

    expect(seen.asideOverflow).toBe('visible')
    expect(seen.asideScrolls).toBe(false)
    expect(seen.areaScrolls || seen.pageScrolls).toBe(true)
  }, 60_000)
})
