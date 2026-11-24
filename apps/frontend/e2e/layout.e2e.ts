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
  fixed: boolean
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
  // a page with a live chart is not still until its height has stopped changing: it is waited for, up to three seconds
  const settle = async box => {
    for (let still = 0, was = -1, tries = 0; still < 3 && tries < 30; tries += 1) {
      await new Promise(resolve => setTimeout(resolve, 150))
      still = box.scrollHeight === was ? still + 1 : 0
      was = box.scrollHeight
    }
  }
  // the boxes of a page (a part of Tune scrolls the body of its pane; a Setup page its middle column)
  const parts = () => ({
    main: document.querySelector('.tune-main .pane-body, .setup-main'),
    side: document.querySelector('.setup-aside, .setup-facts, .tune-aside'),
    nav: document.querySelector('.setup-nav'),
    tabs: document.querySelector('[aria-label="Tune sections"]'),
    area: document.querySelector('.app-main'),
  })
  // the fixed bottom parts of a Tune part (under its main column and in its aside): where they are, and whether, after the column
  // was moved, they are where they were and in the window (with the Write button and "Put back initial values")
  const fixedParts = () => [...document.querySelectorAll(
    '.tune-main .pane-bottom, .tune-aside .pane-bottom, .setup-aside .pane-bottom',
  )]
  const fixedTops = () => fixedParts().map(part => Math.round(part.getBoundingClientRect().top))
  const fixedStayed = before => fixedParts().every((part, at) => {
    const box = part.getBoundingClientRect()
    return Math.round(box.top) === before[at] && box.bottom <= window.innerHeight + 1
  })
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
    const { main, side, nav, tabs, area } = parts()
    await settle(main)
    const top = element => element ? element.getBoundingClientRect().top : 0
    const before = top(side)
    const fixedBefore = fixedTops()
    const navBefore = top(nav) + top(tabs)
    main.scrollTop = 300
    await new Promise(resolve => requestAnimationFrame(resolve))
    // (how far it could go is read WITH where it got to: a live chart may change the height of the page between the two)
    const scrollWant = Math.round(Math.min(300, main.scrollHeight - main.clientHeight))
    const root = document.scrollingElement
    const result = {
      before, after: top(side), navBefore, navAfter: top(nav) + top(tabs), scrollWant, scrollGot: Math.round(main.scrollTop),
      fixed: fixedStayed(fixedBefore),
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
  const ready = `document.querySelector('.tune-main .pane-body, .setup-main')?.clientHeight > 0`
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
    fixed: seen.fixed,
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
        fixed: true,
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

it('stacks a part of Tune at 999 px wide: the page scrolls as a whole and both fixed parts are reachable', async () => {
  await resize({ width: 999, height: 700 })
  await visit('tune/rate')
  const seen = await window().evaluate<{ stacked: boolean, reach: boolean }>(`(() => {
    const main = document.querySelector('.tune-main')
    const aside = document.querySelector('.tune-aside')
    const root = document.scrollingElement
    const bodies = [...document.querySelectorAll('.tune-page .pane-body')]
    const bottoms = [...document.querySelectorAll('.tune-page .pane-bottom')]
    root.scrollTop = root.scrollHeight
    document.querySelector('.app-main').scrollTop = document.querySelector('.app-main').scrollHeight
    return {
      // (the aside is below the main column, and no body scrolls by itself: the page does)
      stacked: aside.getBoundingClientRect().top >= main.getBoundingClientRect().bottom - 1
        && bodies.every(body => getComputedStyle(body).overflowY === 'visible'),
      reach: bottoms.every(part => part.getBoundingClientRect().bottom <= window.innerHeight + 1),
    }
  })()`)

  expect(seen).toEqual({ stacked: true, reach: true })
}, 60_000)

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

/** The Logs replay page is a map and an aside that fills the area under the tabs: the shell's main column must not scroll. */
const REPLAY_SIZES = [{ width: 1280, height: 900 }, { width: 1000, height: 700 }]

for (const size of REPLAY_SIZES) {
  it(`keeps the Logs replay page inside the main column, at ${size.width}x${size.height}`, async () => {
    await resize(size)
    await window().evaluate(`location.hash = '#/logs/replay'`)
    await window().waitFor(`document.querySelector('.logs-replay')?.clientHeight > 0`, 30_000)
    await window().evaluate<void>(`new Promise(resolve => setTimeout(resolve, 400))`)
    const seen = await window().evaluate<{ content: number, box: number, page: boolean, children: string[] }>(`(() => {
      const area = document.querySelector('.app-main')
      const root = document.scrollingElement
      const logs = document.querySelector('.logs')
      const high = child => Math.round(child.getBoundingClientRect().height)
      const children = [...logs.children].map(child => child.tagName + '.' + child.className + ' ' + high(child))
      return { content: area.scrollHeight, box: area.clientHeight, page: root.scrollHeight > window.innerHeight + 1, children }
    })()`)

    expect(seen.content, seen.children.join(' | ')).toBeLessThanOrEqual(seen.box)
    expect(seen.page).toBe(false)
  }, 60_000)
}

/**
 * Types a value that differs into the first ten sliders of the page that is shown (the top of each one's range).
 *
 * @returns how many were typed
 */
async function stageTen(): Promise<number> {
  const rows = await window().evaluate<string[]>(`[...document.querySelectorAll('[data-tune]')]
    .filter(row => row.querySelector('input[type="range"]'))
    .slice(0, 10)
    .map(row => row.dataset.tune + ' ' + row.querySelector('input[type="range"]').max)`)
  for (const row of rows) {
    const [id, max] = row.split(' ')
    // eslint-disable-next-line no-await-in-loop -- one value after the other
    await window().fill(`[data-tune="${id}"] input[type="text"]`, max as string)
  }

  return rows.length
}

for (const width of [1000, 1280]) {
  it(`keeps the top bar one row at ${width} px however long the connection line is: the rail does not move (#343)`, async () => {
    await resize({ width, height: 768 })
    const where = `JSON.stringify([document.querySelector('#top-bar').offsetHeight,
      ...[...document.querySelectorAll('nav.rail a')].map(link => Math.round(link.getBoundingClientRect().top))])`
    const before = await window().evaluate<string>(where)
    // (what a reconnect says, and more: the page sets it again with the next update, which this does not wait for)
    await window().evaluate(`(() => {
      const line = 'connected · system 1/1 · QUADROTOR · ARDUPILOTMEGA'
      document.querySelector('#top-bar .vehicle .title').textContent = line.repeat(2)
      document.querySelector('#top-bar .vehicle .sub').textContent = 'reconnected to the same vehicle '.repeat(4)
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    })()`)

    expect(JSON.parse(await window().evaluate<string>(where))[0]).toBe(64)
    expect(await window().evaluate<string>(where)).toBe(before)
  })
}

/** The pages where a status comes and goes above controls (#562): the status's id, and the controls that must stay put. */
const STATUS_LINES = [
  { page: 'logs/vehicle', status: 'logs-blocked', controls: '.logs-toolbar button' },
  { page: 'setup/accel', status: 'calibration-blocked', controls: '.setup-actions button' },
  { page: 'setup/signing', status: 'signing-blocked', controls: '#signing-form button, #signing-form input' },
]

/** Where the controls under each status line were while the vehicle was known to be disarmed (nothing said in the line). */
const quiet = new Map<string, string>()

/**
 * Opens a page, waits until its status line says something or nothing, and says where its controls are.
 *
 * @param line the page, its status and its controls
 * @param line.page the page, as the address names it
 * @param line.status the id of its status line
 * @param line.controls the controls under it
 * @param said whether the line must say something (the vehicle's state not known) or nothing
 * @returns the top of each control, rounded, as JSON (not the left: a primary button is narrower while it is off, its weight is
 * lighter, and the ones beside it move by a pixel or two then, whatever the status says)
 */
async function controlsAt(line: { page: string, status: string, controls: string }, said: boolean): Promise<string> {
  await window().evaluate(`location.hash = '#/${line.page}'`)
  const empty = `document.getElementById('${line.status}')?.classList.contains('empty')`
  await window().waitFor(`location.hash === '#/${line.page}' && ${empty} === ${!said}
    && document.querySelector('${line.controls}')?.getBoundingClientRect().height > 0`, 60_000)
  await window().evaluate<void>(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)

  return window().evaluate<string>(`JSON.stringify([...document.querySelectorAll('${line.controls}')]
    .map(control => Math.round(control.getBoundingClientRect().top)))`)
}

// (before the vehicle is silenced: its state is known, it is disarmed, and the status lines say nothing)
it('notes where the controls under a status line are while nothing is said in it', async () => {
  await resize({ width: 1440, height: 768 })

  for (const line of STATUS_LINES) {
    // eslint-disable-next-line no-await-in-loop -- one page after the other
    quiet.set(line.page, await controlsAt(line, false))
  }

  expect([...quiet.values()].every(at => at.length > 2)).toBe(true)
}, 120_000)

// (last in the file: the vehicle is silenced, and stays so)
it('keeps Write and "Put back initial values" in a 1100x480 window with a reason and many changes in the aside', async () => {
  await resize({ width: 1100, height: 480 })
  await window().evaluate(`location.hash = '#/tune/more'`)
  await window().waitFor(`document.querySelectorAll('[data-tune] input[type="range"]').length >= 5`, 30_000)
  const staged = await stageTen()
  await window().waitFor(`document.querySelectorAll('.tune-write-row').length >= ${staged - 2}`, 10_000)
  // a vehicle that says nothing: its state is not known, and the aside says why at its top
  vehicle?.mute()
  await window().waitFor(`document.querySelector('#tune-more-blocked') !== null`, 60_000)
  await window().evaluate<void>(`new Promise(resolve => setTimeout(resolve, 400))`)
  const seen = await window().evaluate<Record<string, number>>(`(() => {
    const box = id => document.getElementById(id).getBoundingClientRect()
    const write = box('tune-more-write')
    const back = box('tune-more-initial')
    const height = window.innerHeight
    return { writeTop: write.top, writeBottom: write.bottom, backTop: back.top, backBottom: back.bottom, height }
  })()`)

  expect(seen.writeTop).toBeGreaterThanOrEqual(0)
  expect(seen.writeBottom).toBeLessThanOrEqual(seen.height! + 1)
  expect(seen.backTop).toBeGreaterThanOrEqual(0)
  expect(seen.backBottom).toBeLessThanOrEqual(seen.height! + 1)
}, 120_000)

// (after the test above: the vehicle is silent, the reason shows and the values are still queued)
it('shows the reason and the changed values whole in a window of the usual height (1440x768): nothing is cut', async () => {
  await resize({ width: 1440, height: 768 })
  await window().evaluate<void>(`new Promise(resolve => setTimeout(resolve, 600))`)
  const seen = await window().evaluate<Record<string, number>>(`(() => {
    const top = document.querySelector('.tune-aside .pane-top')
    const list = document.querySelector('.tune-write-list')
    const write = document.getElementById('tune-more-write').getBoundingClientRect()
    return {
      topCut: top ? top.scrollHeight - top.clientHeight : 99,
      listShown: list.clientHeight,
      listNatural: Math.min(list.scrollHeight, 150),
      writeBottom: write.bottom,
      height: window.innerHeight,
    }
  })()`)

  // (the reason has the room it needs, the list is its natural height up to the box it scrolls in, and Write is in the window)
  expect(seen.topCut).toBeLessThanOrEqual(1)
  expect(seen.listShown).toBeGreaterThanOrEqual(seen.listNatural!)
  expect(seen.writeBottom).toBeLessThanOrEqual(seen.height! + 1)
}, 60_000)

// (after the vehicle is silenced: its state is not known, and each status line says so)
it('keeps the controls under a status line where they were when it says the state is not known (#562)', async () => {
  await resize({ width: 1440, height: 768 })
  const moved: string[] = []
  for (const line of STATUS_LINES) {
    // eslint-disable-next-line no-await-in-loop -- one page after the other
    const now = await controlsAt(line, true)
    if (now !== quiet.get(line.page)) {
      moved.push(`${line.page}: ${quiet.get(line.page)} -> ${now}`)
    }
  }

  expect(moved).toEqual([])
}, 120_000)
