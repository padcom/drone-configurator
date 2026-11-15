// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the scrolling rule.
// On every Setup page and Tune part that has a side panel, only the page's middle column scrolls: when it is moved, the side
// panel (and the list of the pages, or the tabs) stays where it is, the area has no scrollbar of its own, and the page has none.
// This is checked in the window sizes of a small laptop (1000x700) and of a large one (1440x768).
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
const SIZES = [{ width: 1000, height: 700 }, { width: 1440, height: 768 }]

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

/** What a page shows when its middle column is moved: the side panel's top before and after, and what else scrolls. */
interface Probe {
  before: number
  after: number
  navBefore: number
  navAfter: number
  moved: boolean
  pageScrolls: boolean
  areaScrolls: boolean
  areaTop: number
  mainTop: number
  mainBox: number[]
  rootTop: number
}

/**
 * The expression that moves the middle column of the page that is shown and says what moved.
 *
 * @returns JavaScript
 */
function probe(): string {
  return `(async () => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const main = document.querySelector('.setup-main')
    const side = document.querySelector('.setup-aside, .setup-facts')
    const nav = document.querySelector('.setup-nav, .section-nav, [aria-label="Tune sections"]')
    const area = document.querySelector('.app-main')
    const top = element => element ? element.getBoundingClientRect().top : 0
    const before = top(side)
    const navBefore = top(nav)
    main.scrollTop = 300
    await new Promise(resolve => requestAnimationFrame(resolve))
    const root = document.scrollingElement
    return {
      before, after: top(side), navBefore, navAfter: top(nav), moved: main.scrollTop > 0,
      pageScrolls: root.scrollHeight > window.innerHeight + 1,
      areaScrolls: area.scrollHeight > area.clientHeight + 1,
      areaTop: area.scrollTop,
      mainTop: main.scrollTop,
      mainBox: [main.clientHeight, main.scrollHeight],
      rootTop: root.scrollTop,
    }
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
 * Opens a page, waits until it is laid out, moves its middle column and says what moved.
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
 * What a page must show: nothing moved but the middle column, and nothing else scrolls.
 *
 * @param page the page
 * @param seen what it showed
 * @returns the facts, to be compared with what a still page shows
 */
function facts(page: string, seen: Probe): Record<string, unknown> {
  return {
    page,
    sideMoved: Math.round(seen.after - seen.before),
    navMoved: Math.round(seen.navAfter - seen.navBefore),
    pageScrolls: seen.pageScrolls,
    areaScrolls: seen.areaScrolls,
    areaTop: seen.areaTop,
    rootTop: seen.rootTop,
  }
}

for (const size of SIZES) {
  it(`keeps the side panel and the list still while the middle column scrolls, at ${size.width}x${size.height}`, async () => {
    await resize(size)
    let scrolled = 0

    for (const page of PAGES) {
      // eslint-disable-next-line no-await-in-loop -- one page after the other, in the one window
      const seen = await visit(page)
      expect(facts(page, seen)).toEqual({
        page, sideMoved: 0, navMoved: 0, pageScrolls: false, areaScrolls: false, areaTop: 0, rootTop: 0,
      })
      scrolled += Number(seen.moved)
    }

    // (a check where nothing could scroll would prove nothing: at the small size the pages are taller than the column)
    expect(scrolled).toBeGreaterThan(size.height === 700 ? 2 : 0)
  }, 180_000)
}
