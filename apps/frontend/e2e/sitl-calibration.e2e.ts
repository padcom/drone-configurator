// The calibrations against ArduPilot SITL in the real window, on SITL's `calibration` model (a vehicle that is turned to the
// angles its servo outputs 5 to 8 say, as ArduPilot's own `sitl_accelcal` and `sitl_magcal` do): the accelerometer's six
// positions (the vehicle is turned to each as the vehicle asks, and the page says "Placed"), and the compass (the vehicle is
// spun about three axes and turned in yaw until every compass has reported; nothing is kept until it is accepted). It
// launches its own SITL.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The six positions: the vehicle takes a few seconds to turn, and the vehicle a few more for each sample. */
const ACCEL_MS = 240_000
/** The compass: the vehicle is spun until every compass has reported (about 90 s at speedup 1). */
const COMPASS_MS = 600_000

let sitl: Sitl | undefined
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
 * SITL.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function vehicle(): Sitl {
  if (!sitl) {
    throw new Error('SITL has not started')
  }

  return sitl
}

/**
 * Waits a while.
 *
 * @param ms how long
 */
const pause = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * The pulse width that makes SITL's calibration model turn to an angle: 1500 + angle * 500 / pi.
 *
 * @param angle radians, within -pi to pi
 * @returns microseconds
 */
function pulseOf(angle: number): number {
  return Math.round(1500 + angle * 500 / Math.PI)
}

/** The angles (roll, pitch) of each position the accelerometer calibration asks for, as `sitl_accelcal` sets them. */
const POSITIONS: Record<number, readonly [number, number]> = {
  1: [0, 0],
  2: [-Math.PI / 2, 0],
  3: [Math.PI / 2, 0],
  4: [0, -Math.PI / 2],
  5: [0, Math.PI / 2],
  6: [Math.PI, 0],
}

/**
 * Turns the vehicle to roll, pitch and yaw (and holds it there).
 *
 * @param roll radians
 * @param pitch radians
 * @param yaw radians, within -pi to pi
 */
async function turnTo(roll: number, pitch: number, yaw: number): Promise<void> {
  await vehicle().setServos([[5, 1150], [6, pulseOf(roll)], [7, pulseOf(pitch)], [8, pulseOf(yaw)]])
}

/**
 * Spins the vehicle about an axis at pi/4 rad/s (output 5 from 1300: the speed; 6 to 8: the axis).
 *
 * @param axis the axis (x, y, z); its biggest part is full scale
 */
async function spinAbout(axis: readonly [number, number, number]): Promise<void> {
  const biggest = Math.max(...axis.map(Math.abs))
  const pulse = (part: number) => Math.round(1500 + part / biggest * 500)
  const speed = 1300 + Math.round(Math.PI / 4 / (2 * Math.PI) * 700)
  await vehicle().setServos([[5, speed], [6, pulse(axis[0])], [7, pulse(axis[1])], [8, pulse(axis[2])]])
}

/**
 * Waits until a button can be pressed (the vehicle is up, disarmed and known to be), then presses it.
 *
 * @param id the button's id
 */
async function pressWhenEnabled(id: string): Promise<void> {
  await window().waitFor(`document.querySelector('#${id}')?.disabled === false`, 90_000)
  await window().click(`#${id}`)
}

/**
 * Opens a page of Setup from its link.
 *
 * @param page `accel` or `compass`
 * @param left how many presses remain
 */
async function openPage(page: string, left = 4): Promise<void> {
  const shown = `document.querySelector('a[href="#/setup/${page}"]')?.getAttribute('aria-current') === 'page'`
  // (The links are there once the parameters are in: the overview shows its cards then.)
  await window().waitFor(`document.querySelector('a[href="#/setup/${page}"]') !== null`, 120_000)

  try {
    await window().click(`a[href="#/setup/${page}"]`)
    await window().waitFor(shown, 5000)
  } catch (error) {
    if (left <= 1) {
      throw error
    }
    await openPage(page, left - 1)
  }
}

/**
 * The percent each compass shows now.
 *
 * @returns the percents, by compass
 */
const percents = () => window().evaluate<number[]>(
  `[...document.querySelectorAll('.setup-compass-percent')].map(e => parseInt(e.textContent, 10))`,
)

/** How long (ms) no compass may move before the next axis is due (half a turn is four seconds, and the link is slow). */
const STILL_MS = 12_000

/** The axes the vehicle is spun about, one after the other. */
const AXES: readonly (readonly [number, number, number])[] = [[1, 0, 0], [0, 1, 0], [1, 1, 0]]

/** Where the spinning is: the axis, and the yaw the vehicle is put at before it is spun. */
interface Spin {
  axis: number
  yaw: number
}

/**
 * The next axis, and the yaw 45 degrees on after the third (kept within -pi to pi).
 *
 * @param at where the spinning is
 * @returns the next
 */
function nextSpin(at: Spin): Spin {
  const axis = (at.axis + 1) % AXES.length
  const turned = at.yaw + Math.PI / 4

  return { axis, yaw: axis === 0 ? turned - (turned > Math.PI ? 2 * Math.PI : 0) : at.yaw }
}

/** What the percents were, and since when they have not changed. */
interface Watched {
  last: string
  since: number
}

/**
 * Whether the vehicle has spun long enough about this axis: no compass moved for a while, or the time is up.
 *
 * @param deadline when to stop (ms since 1970)
 * @param since when the percents last changed
 * @returns true when it is time to stop
 */
function stalled(deadline: number, since: number): boolean {
  return Date.now() >= deadline || Date.now() - since >= STILL_MS
}

/**
 * Looks at the percents once more.
 *
 * @param before what they were
 * @returns what they are, and since when they have been so
 */
async function watched(before: Watched): Promise<Watched> {
  const now = JSON.stringify(await percents())

  return { last: now, since: now === before.last ? before.since : Date.now() }
}

/**
 * Waits while the vehicle spins: true when the page has what it waits for, false when no compass moved for a while (the next
 * axis is due) or the time is up.
 *
 * @param until the page expression that says it is done
 * @param deadline when to stop (ms since 1970)
 * @param seen what the percents were
 * @returns whether the page has it
 */
async function spinsUntilStill(until: string, deadline: number, seen: Watched): Promise<boolean> {
  if (await window().evaluate<boolean>(until)) {
    return true
  }
  if (stalled(deadline, seen.since)) {
    return false
  }
  await pause(1000)

  return spinsUntilStill(until, deadline, await watched(seen))
}

/**
 * Spins and turns the vehicle as `sitl_magcal` does until the page has the results: level at a yaw, then a spin about x, y and
 * x+y one after the other, each until no compass has moved for a while, then the next yaw 45 degrees on.
 *
 * @param until the page expression that says it is done
 * @param deadline when to give up (ms since 1970)
 * @param at where the spinning is
 */
async function spinFrom(until: string, deadline: number, at: Spin): Promise<void> {
  if (Date.now() >= deadline) {
    throw new Error('the vehicle was spun for as long as it was given and the page never had the results')
  }
  await turnTo(0, 0, at.yaw)
  await pause(3000)
  await spinAbout(AXES[at.axis] ?? [1, 0, 0])

  if (await spinsUntilStill(until, deadline, { last: '', since: Date.now() })) {
    await vehicle().setServos([[5, 1000]])

    return
  }
  await spinFrom(until, deadline, nextSpin(at))
}

/**
 * Spins the vehicle until the page has the results.
 *
 * @param until the page expression that says it is done
 * @param seconds how long it may take
 * @returns when the page has them
 */
const spinUntil = (until: string, seconds: number) => spinFrom(until, Date.now() + seconds * 1000, { axis: 0, yaw: 0 })

async function startAll(): Promise<void> {
  // The accelerometer has a bias, as ArduPilot's own test gives it: the calibration finds it, and INS_ACCOFFS change from
  // what they were.
  sitl = await startSitl({
    vehicle: 'copter',
    frame: 'calibration',
    simParams: { SIM_ACC1_BIAS_X: 0.3, SIM_ACC1_BIAS_Y: -0.2, SIM_ACC1_BIAS_Z: 0.25 },
  })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'setup')
}

async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * The values the accelerometer page shows now, by name.
 *
 * @returns the offsets and scales as text
 */
const accelValues = () => window().evaluate<string>(`document.querySelector('#setup-accel-values')?.textContent ?? ''`)

/**
 * Turns the vehicle to each position from this one to the sixth when the vehicle asks for it, and says it is there.
 *
 * @param position the position, 1 to 6
 */
async function placeFrom(position: number): Promise<void> {
  if (position > 6) {
    return
  }
  await window().waitFor(`document.querySelector('.setup-position[data-position="${position}"].current') !== null`, 90_000)
  const [roll, pitch] = POSITIONS[position] ?? [0, 0]
  await turnTo(roll, pitch, 0)
  // The vehicle turns, and settles: the sample is taken only when the user says it is in the position.
  await pause(4000)
  await pressWhenEnabled('setup-accel-placed')
  await placeFrom(position + 1)
}

/**
 * How the last calibration ended, as the page says it.
 *
 * @returns `success`, `failed`, `cancelled` or `refused`
 */
const outcome = () => window().evaluate<string>(`document.querySelector('#calibration-result').getAttribute('data-outcome')`)

async function calibratesTheAccelerometerInSixPositions(): Promise<void> {
  await openPage('accel')
  await pressWhenEnabled('setup-accel-start')
  await placeFrom(1)
  await window().waitFor(`document.querySelector('#calibration-result') !== null`, 90_000)
  await vehicle().setServos([[5, 1000]])

  expect(await outcome()).toBe('success')
  expect(await window().text('#calibration-texts')).toContain('Calibration successful')
  expect(await window().evaluate<number>(`document.querySelectorAll('.setup-position.placed').length`)).toBe(6)
  // The vehicle's offsets changed (they were zero): the page shows what the vehicle has now, after its own success.
  const shown = await accelValues()
  expect(shown).toContain('INS_ACCOFFS_X')
  expect(shown).not.toMatch(/INS_ACCOFFS_X0INS_/u)
}

async function setsTheLevel(): Promise<void> {
  await turnTo(0, 0, 0)
  await pause(4000)
  await vehicle().setServos([[5, 1000]])
  await pressWhenEnabled('setup-accel-level')
  await window().waitFor(`document.querySelector('#calibration-result')?.getAttribute('data-outcome') === 'success'`, 60_000)

  expect(await window().text('#calibration-texts')).toContain('Trim OK')
}

async function calibratesTheCompassAndKeepsItOnlyWhenAccepted(): Promise<void> {
  await openPage('compass')
  await pressWhenEnabled('setup-compass-start')
  await window().waitFor(`document.querySelector('[data-compass="0"]') !== null`, 90_000)
  await spinUntil(`document.querySelector('#setup-compass-accept') !== null`, 480)

  const first = await window().text('[data-report="0"]')
  expect(first).toContain('Fitness')
  expect(await window().evaluate<string>(`document.querySelector('[data-compass="0"]').getAttribute('data-compass')`)).toBe('0')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-compass-kept') === null`)).toBe(true)
  await window().click('#setup-compass-accept')
  await window().waitFor(`document.querySelector('#setup-compass-kept') !== null`, 60_000)

  expect(await outcome()).toBe('success')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-reboot') !== null`)).toBe(true)
}

async function cancelsTheCompassWhenThePageIsLeft(): Promise<void> {
  await window().waitFor(`document.querySelector('#setup-compass-start')?.disabled === false`, 60_000)
  await pressWhenEnabled('setup-compass-start')
  await window().waitFor(`document.querySelector('[data-compass="0"]') !== null`, 90_000)
  await openPage('accel')
  await openPage('compass')
  await window().waitFor(`document.querySelector('#calibration-result')?.getAttribute('data-outcome') === 'cancelled'`, 60_000)

  expect(await window().evaluate<boolean>(`document.querySelector('#setup-compass-accept') === null`)).toBe(true)
}

describeSitl(
  'the accelerometer and the compass against ArduPilot SITL',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)

    it('calibrates the accelerometer in six positions, with its success', calibratesTheAccelerometerInSixPositions, ACCEL_MS)
    it('sets the level', setsTheLevel, 120_000)
    it('calibrates the compass, and keeps it only when accepted', calibratesTheCompassAndKeepsItOnlyWhenAccepted, COMPASS_MS)
    it('cancels a compass calibration when the page is left', cancelsTheCompassWhenThePageIsLeft, 180_000)
  },
  { launchOnly: true },
)
