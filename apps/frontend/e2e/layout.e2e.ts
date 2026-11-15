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

/** The pages to look at, as the address names them (all have a side panel but the motors). */
const PAGES = [
  'setup/home',
  'setup/frame',
  'setup/accel',
  'setup/compass',
  'setup/radio',
  'setup/escs',
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
  portRows: number
  drawingBeside: boolean
  outputsBeside: boolean
  labelled: boolean
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
  // the fields of a serial port are in one row; the drawing of a frame is beside its dropdowns (when the page has them)
  const rows = () => {
    const port = document.querySelector('.setup-port')
    const tops = port ? [...port.querySelectorAll('input')].map(input => Math.round(input.getBoundingClientRect().top)) : []
    const fields = document.querySelector('.setup-frame-row .setup-fields')
    const drawing = document.querySelector('.setup-frame-row .setup-frame-drawing svg')
    const test = document.querySelector('.setup-motors-pair > .motor-test')
    const outputs = document.querySelector('.setup-motors-outputs')
    const beside = (left, right) =>
      !left || !right || right.getBoundingClientRect().left >= left.getBoundingClientRect().right - 1
    const shown = element => element && getComputedStyle(element).display !== 'none'
    const label = document.querySelector('.setup-port-label')
    const head = document.querySelector('.setup-ports-head')
    // the heads or the labels of the fields are seen, one or the other
    const labelled = !label || Boolean(shown(label)) !== Boolean(shown(head))
    const portRows = new Set(tops).size || 1
    return { portRows, drawingBeside: beside(fields, drawing), outputsBeside: beside(test, outputs), labelled }
  }
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
      ...rows(),
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
  const ready = `document.querySelector('.setup-main')?.clientHeight > 0`
  await window().waitFor(`location.hash === '#/${page}' && ${ready}`, 30_000)

  return window().evaluate<Probe>(probe())
}

/**
 * What a wide window shows: the middle column is about 310 px wide at 1000 px, beside the list and the side panel, and the rows
 * of a serial port are in one line, the drawing of the frame beside its dropdowns and the outputs beside the motor test only
 * when the window is wide enough for them.
 *
 * @param seen what the page showed
 * @param width the window's width
 * @returns the facts that are looked at in a window that wide
 */
function wide(seen: Probe, width: number): Record<string, unknown> {
  const wideEnough = width >= 1300

  return {
    portRows: wideEnough ? seen.portRows : 1,
    drawingBeside: !wideEnough || seen.drawingBeside,
    outputsBeside: !wideEnough || seen.outputsBeside,
  }
}

/**
 * What a page shows, as the facts a page that keeps its panels still must show.
 *
 * @param page the page
 * @param seen what it showed
 * @param size the window
 * @param size.width its width
 * @param size.height its height
 * @returns the facts
 */
function facts(page: string, seen: Probe, size: { width: number, height: number }): Record<string, unknown> {
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
    labelled: seen.labelled,
    ...wide(seen, size.width),
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
        portRows: 1,
        drawingBeside: true,
        outputsBeside: true,
        labelled: true,
        listScrolls: false,
      })
      scrolled += seen.scrollWant > 0 ? 1 : 0
    }

    // (a check where nothing could scroll would prove nothing: at the short sizes the pages are taller than the column)
    expect(scrolled).toBeGreaterThan(size.height === 768 ? 0 : 2)
  }, 180_000)
}

/** What the first serial port's row is laid out as: its tracks in px, the gap, whether the heads or the labels are seen. */
interface PortRow {
  tracks: number[]
  gap: number
  width: number
  heads: boolean
  labels: boolean
}

/**
 * Opens the Serial ports page and says how the first port's row is laid out.
 *
 * @returns the row
 */
async function portRow(): Promise<PortRow> {
  await window().evaluate(`location.hash = '#/setup/serial'`)
  await window().waitFor(`document.querySelector('.setup-port') !== null`, 30_000)
  await window().evaluate<void>(`new Promise(resolve => setTimeout(resolve, 400))`)

  return window().evaluate<PortRow>(`(() => {
    const row = document.querySelector('.setup-port')
    const style = getComputedStyle(row)
    const shown = element => element !== null && getComputedStyle(element).display !== 'none'
    return {
      tracks: style.gridTemplateColumns.split(' ').map(Number.parseFloat),
      gap: Number.parseFloat(style.columnGap),
      width: row.clientWidth,
      heads: shown(document.querySelector('.setup-ports-head')),
      labels: shown(document.querySelector('.setup-port-label')),
    }
  })()`)
}

it('lays the serial ports out with Speed 30% wider and Protocol narrower, in a window wide enough for one row', async () => {
  await resize({ width: 1440, height: 900 })
  const row = await portRow()
  const [name, protocol, speed, options] = row.tracks
  // (what it was: Speed 7 rem, and Protocol and Options sharing what was left equally)
  const oldProtocol = (row.width - (name ?? 0) - 112 - 3 * row.gap) / 2

  expect(row.tracks).toHaveLength(4)
  expect(speed).toBeCloseTo(112 * 1.3, 0)
  expect(protocol).toBeLessThan(oldProtocol - 10)
  expect(protocol).toBeLessThan(options ?? 0)
  expect(row.heads).toBe(true)
  expect(row.labels).toBe(false)
})

it('stacks the serial ports in a narrow column, with the labels in the place of the heads', async () => {
  await resize({ width: 1000, height: 700 })
  const row = await portRow()

  expect(row.tracks).toHaveLength(1)
  expect(row.heads).toBe(false)
  expect(row.labels).toBe(true)
})
