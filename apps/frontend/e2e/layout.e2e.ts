// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the scrolling rule.
// On every Setup page and Tune part that has a side panel, only the page's middle column scrolls: when it is moved, the side
// panel (and the list of the pages, or the tabs) stays where it is, the area has no scrollbar of its own, and the page has none.
// This is checked in the window sizes of a small laptop (1000x700), of a large one (1440x768) and of a short one (1000x500, where
// the side panel and the list must still be reachable: they scroll on their own), and that the columns have room for a focus
// outline (it must not be cut at their edge).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

let vehicle: TcpVehicle | undefined
let app: E2eApp | undefined

/** The pages that have a side panel, as the address names them. */
const PAGES = [
  'setup/home',
  'setup/frame',
  'setup/accel',
  'setup/compass',
  'setup/radio',
  'setup/motors',
  'setup/modes',
  'setup/failsafes',
  'setup/battery',
  'setup/initial',
  'setup/serial',
  'tune/rate',
  'tune/more',
  'tune/filters',
]
const SIZES = [{ width: 1000, height: 700 }, { width: 1440, height: 768 }, { width: 1000, height: 500 }]

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
 * @param size the width and the height
 * @param size.width the width
 * @param size.height the height
 */
async function resize(size: { width: number, height: number }): Promise<void> {
  await window().devtools('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false })
}

/** What a page shows when its middle column is moved: where the side panel and the list are, and what else scrolls. */
interface Probe {
  before: number
  after: number
  navBefore: number
  navAfter: number
  scrollWant: number
  scrollGot: number
  pageScrolls: boolean
  areaScrolls: boolean
  areaTop: number
  rootTop: number
  reachable: boolean
  room: number
  below: string[]
  sideways: string[]
  listScrolls: boolean
}

/** The helpers of the probe, in the page: where a box scrolls to its end, and how much room it has for a focus outline. */
const HELPERS = `
  // the last control of a column that scrolls on its own is in the window once it is scrolled to its end
  const reach = box => {
    if (!box) return true
    box.scrollTop = box.scrollHeight
    const last = [...box.querySelectorAll('a[href], button, input, select')].at(-1)
    const inside = box.getBoundingClientRect()
    const at = last ? last.getBoundingClientRect() : inside
    return at.bottom <= inside.bottom + 1 && inside.bottom <= window.innerHeight + 1
  }
  // the room a column has around its content for a focus outline (2 px, 2 px away)
  const room = box => {
    if (!box) return 99
    const style = getComputedStyle(box)
    return Math.min(...['Top', 'Right', 'Bottom', 'Left'].map(edge => parseFloat(style['padding' + edge])))
  }
  // what is below the window
  const below = () => [...document.querySelectorAll('body *')]
    .filter(element => !element.closest('.rail') && element.getBoundingClientRect().bottom > window.innerHeight + 1)
    .slice(0, 4).map(element => element.tagName + '.' + element.className + ' ' + document.scrollingElement.scrollHeight)
  // what lies beyond the right edge of a column that never scrolls sideways
  const sideways = box => {
    const edge = box.getBoundingClientRect().right
    const over = [...box.querySelectorAll('*')].filter(element => element.getBoundingClientRect().right > edge + 1)
    return box.scrollWidth > box.clientWidth + 1 ? over.slice(0, 4).map(element => element.tagName + '.' + element.className) : []
  }
`

/**
 * The expression that moves the middle column of the page that is shown and says what moved.
 *
 * @returns JavaScript
 */
function probe(): string {
  return `(async () => {
    ${HELPERS}
    await new Promise(resolve => setTimeout(resolve, 400))
    const main = document.querySelector('.setup-main')
    const side = document.querySelector('.setup-aside, .setup-facts')
    const nav = document.querySelector('.setup-nav')
    const tabs = document.querySelector('[aria-label="Tune sections"]')
    const area = document.querySelector('.app-main')
    const top = element => element ? element.getBoundingClientRect().top : 0
    const before = top(side)
    const navBefore = top(nav) + top(tabs)
    const scrollWant = Math.min(300, main.scrollHeight - main.clientHeight)
    main.scrollTop = 300
    await new Promise(resolve => requestAnimationFrame(resolve))
    const root = document.scrollingElement
    const result = {
      before, after: top(side), navBefore, navAfter: top(nav) + top(tabs), scrollWant, scrollGot: Math.round(main.scrollTop),
      pageScrolls: root.scrollHeight > window.innerHeight + 1,
      areaScrolls: area.scrollHeight > area.clientHeight + 1,
      areaTop: area.scrollTop,
      rootTop: root.scrollTop,
      below: below(),
      sideways: sideways(main),
      listScrolls: Boolean(nav) && nav.scrollHeight > nav.clientHeight + 1,
    }
    result.reachable = reach(side) && reach(nav) && reach(main)
    result.room = Math.min(room(main), room(nav))
    return result
  })()`
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'setup')
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

/**
 * Opens a page and waits until it is laid out, moves its middle column and says what moved.
 *
 * @param page the page, as the address names it
 * @returns what the page showed
 */
async function visit(page: string): Promise<Probe> {
  await window().evaluate(`location.hash = '#/${page}'`)
  const ready = `document.querySelector('.setup-main')?.clientHeight > 0 && document.querySelector('.setup-aside, .setup-facts')`
  await window().waitFor(`location.hash === '#/${page}' && ${ready}`, 30_000)

  return window().evaluate<Probe>(probe())
}

/**
 * What a page shows, as the facts a page that keeps its panels still must show.
 *
 * @param page the page
 * @param seen what it showed
 * @param size the window
 * @param size.height its height
 * @returns the facts
 */
function facts(page: string, seen: Probe, size: { height: number }): Record<string, unknown> {
  return {
    page,
    sideMoved: Math.round(seen.after - seen.before),
    navMoved: Math.round(seen.navAfter - seen.navBefore),
    scrollOff: seen.scrollGot - seen.scrollWant,
    pageScrolls: seen.pageScrolls ? seen.below : false,
    areaScrolls: seen.areaScrolls,
    areaTop: seen.areaTop,
    rootTop: seen.rootTop,
    reachable: seen.reachable,
    roomForOutline: seen.room >= 4,
    sideways: seen.sideways,
    // (the list of the pages scrolls by itself only in a window too short for it: below 600 px)
    listScrolls: size.height >= 600 && seen.listScrolls,
  }
}

for (const size of SIZES) {
  it(`keeps the side panel and the list still while the middle column scrolls, at ${size.width}x${size.height}`, async () => {
    await resize(size)
    let scrolled = 0

    for (const page of PAGES) {
      // eslint-disable-next-line no-await-in-loop -- one page after the other, in the one window
      const seen = await visit(page)
      expect(facts(page, seen, size)).toEqual({
        page,
        sideMoved: 0,
        navMoved: 0,
        scrollOff: 0,
        pageScrolls: false,
        areaScrolls: false,
        areaTop: 0,
        rootTop: 0,
        reachable: true,
        roomForOutline: true,
        sideways: [],
        listScrolls: false,
      })
      scrolled += seen.scrollWant > 0 ? 1 : 0
    }

    // (a check where nothing could scroll would prove nothing: at the short sizes the pages are taller than the column)
    expect(scrolled).toBeGreaterThan(size.height === 768 ? 0 : 2)
  }, 180_000)
}
