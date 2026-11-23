// End to end, in the real window on Linux: the performance budgets (#22) that are not one screen's own, judged against
// apps/frontend/budgets.json by e2e/budgets.ts (the median within the budget, the 95th percentile within the budget times its
// noise). Cold start: from starting the process to the page's `app-usable` mark, five starts. Screen switch: every screen,
// three rounds. Initial JS: the module script and modulepreloads of the app built for this run. Long tasks: the longest task of
// each second while the Flight data screen shows the simulated vehicle's telemetry (25 Hz). And the checks catch what they say:
// a slowdown put into the page on purpose (a busy wait on every navigation click, a busy wait every 300 ms) makes them fail.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectWithinBudget, judge } from './budgets'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { SCREENS, switchTime } from './switch'
import { TcpVehicle } from './tcp-vehicle'

/** How many cold starts are timed; how many rounds of switches; how many seconds of telemetry are watched for long tasks. */
const COLD_STARTS = 5
const SWITCH_ROUNDS = 3
const TELEMETRY_SECONDS = 20
/** The app that `pico-desktop test --e2e` built for this run. */
const BUILT = new URL('../../../.pico-desktop/e2e/app/', import.meta.url)

/**
 * Waits.
 *
 * @param ms how long
 * @returns when it has
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/**
 * Starts the app, waits until it is usable, and says how long that took from the moment before the process was started: the
 * page's clock is the machine's (`performance.timeOrigin` is a time of day), so the mark is compared with the test's own clock.
 *
 * @returns the milliseconds from starting the process to the `app-usable` mark
 */
async function coldStart(): Promise<number> {
  const started = Date.now()
  const app = await launchApp()
  try {
    await app.waitFor(`performance.getEntriesByName('app-usable').length > 0`, 30_000)
    const usable = await app.evaluate<number>(`performance.timeOrigin + performance.getEntriesByName('app-usable')[0].startTime`)

    return usable - started
  } finally {
    await app.close()
  }
}

/**
 * Starts the app `COLD_STARTS` times, one after the other (two would share the folder and the machine).
 *
 * @returns each start's time, in ms
 */
async function coldStarts(): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < COLD_STARTS; i++) {
    // eslint-disable-next-line no-await-in-loop
    times.push(await coldStart())
  }

  return times
}

/**
 * Switches to every screen, `rounds` times (each must have been shown before: a screen is loaded when it is first shown).
 *
 * @param app the running app
 * @param rounds how many rounds
 * @returns every switch's time, in ms
 */
async function switchTimes(app: E2eApp, rounds: number): Promise<number[]> {
  const times: number[] = []
  for (let round = 0; round < rounds; round++) {
    for (const { id, marker } of SCREENS) {
      // One after the other: the clicks must not overlap.
      // eslint-disable-next-line no-await-in-loop
      times.push(await switchTime(app, id, marker))
    }
  }

  return times
}

/**
 * The files of the initial JavaScript of the app built for this run: index.html's module script, then its modulepreloads.
 *
 * @returns their paths, as index.html gives them
 */
function initialScripts(): string[] {
  const html = readFileSync(new URL('index.html', BUILT), 'utf8')
  const script = /<script[^>]*type="module"[^>]*src="(?<file>[^"]+)"/gu
  const preload = /<link[^>]*rel="modulepreload"[^>]*href="(?<file>[^"]+)"/gu

  return [...html.matchAll(script), ...html.matchAll(preload)].map(match => match.groups?.file ?? '')
}

/**
 * The size of some of the built app's files.
 *
 * @param files their paths, as index.html gives them
 * @returns the sum of their sizes, in KiB
 */
function kibOf(files: string[]): number {
  return files.reduce((sum, file) => sum + readFileSync(new URL(file, BUILT)).length, 0) / 1024
}

/**
 * A page script that watches the main thread for `seconds` and gives, for each second, its longest task (0 for a second
 * without one; the browser reports a task as long from 50 ms).
 *
 * @param seconds how long it watches
 * @returns the script
 */
function longestTasks(seconds: number): string {
  return `new Promise(resolve => {
    const tasks = []
    const observer = new PerformanceObserver(list => list.getEntries().forEach(task => tasks.push(task)))
    observer.observe({ type: 'longtask' })
    const start = performance.now()
    setTimeout(() => {
      observer.disconnect()
      const longest = Array(${seconds}).fill(0)
      for (const task of tasks) {
        const second = Math.floor((task.startTime - start) / 1000)
        if (second >= 0 && second < ${seconds}) longest[second] = Math.max(longest[second], task.duration)
      }
      resolve(longest)
    }, ${seconds * 1000})
  })`
}

/** Page scripts that add a deliberate slowdown (`window.__slowdown` takes it away): a busy wait on each navigation click... */
const SLOW_CLICKS = `(() => {
  const busy = ms => { const end = performance.now() + ms; while (performance.now() < end); }
  const onClick = event => event.target.closest('nav a') && busy(150)
  document.addEventListener('click', onClick, true)
  window.__slowdown = () => document.removeEventListener('click', onClick, true)
})()`
/** ...and a busy wait every 300 ms. */
const SLOW_TICKS = `(() => {
  const busy = ms => { const end = performance.now() + ms; while (performance.now() < end); }
  const timer = setInterval(() => busy(120), 300)
  window.__slowdown = () => clearInterval(timer)
})()`

/**
 * Measures with a deliberate slowdown in the page, and says whether the budget was missed (the slowdown is taken away after).
 *
 * @param app the running app
 * @param slowdown the page script that adds the slowdown
 * @param name the budget
 * @param measure what is measured
 * @returns the verdict
 */
async function withSlowdown(
  app: E2eApp, slowdown: string, name: string, measure: () => Promise<number[]>,
): Promise<ReturnType<typeof judge>> {
  await app.evaluate(slowdown)

  try {
    return judge(name, await measure())
  } finally {
    await app.evaluate(`window.__slowdown()`)
  }
}

/**
 * Starts the app and shows every screen once, so that each is loaded before it is timed.
 *
 * @returns the app
 */
async function appWithEveryScreen(): Promise<E2eApp> {
  const app = await launchApp()
  await app.waitForText('#connection', 'disconnected')

  for (const { id } of SCREENS) {
    // eslint-disable-next-line no-await-in-loop
    await showScreen(app, id)
  }

  return app
}

/**
 * Switches once to every screen with a deliberate slowdown on navigation clicks.
 *
 * @param app the running app
 * @returns the verdict
 */
function slowSwitches(app: E2eApp): Promise<ReturnType<typeof judge>> {
  return withSlowdown(app, SLOW_CLICKS, 'screenSwitch', () => switchTimes(app, 1))
}

/**
 * Watches for long tasks for 5 s with a deliberate busy wait every 300 ms.
 *
 * @param app the running app
 * @returns the verdict
 */
function slowTicks(app: E2eApp): Promise<ReturnType<typeof judge>> {
  return withSlowdown(app, SLOW_TICKS, 'longTask', () => app.evaluate<number[]>(longestTasks(5)))
}

/**
 * Starts the app, connected to the simulated vehicle and on the Flight data screen, settled (the connection's own work done).
 *
 * @param vehicle the simulated vehicle
 * @returns the app
 */
async function connectedApp(vehicle: TcpVehicle): Promise<E2eApp> {
  const app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  await app.waitFor(`document.querySelector('#telemetry') !== null`)
  await sleep(3000)

  return app
}

describe('cold start', () => {
  it(`is usable within the budget: the shell in the page, the backend answering (${COLD_STARTS} starts)`, async () => {
    expectWithinBudget('coldStart', await coldStarts())
  }, 180_000)
})

describe('the app, idle', () => {
  let app: E2eApp

  beforeAll(async () => {
    app = await appWithEveryScreen()
  }, 60_000)

  afterAll(async () => {
    await app?.close()
  })

  it('loads no more initial JavaScript than the budget: the module script and its modulepreloads', async () => {
    const files = initialScripts()

    // The page measured is the one built: it loaded the same module script.
    expect(files[0]).toBe(await app.evaluate<string>(`document.querySelector('script[type="module"]').getAttribute('src')`))
    expectWithinBudget('initialJs', [kibOf(files)])
  })

  it(`switches between screens within the budget (every screen, ${SWITCH_ROUNDS} rounds)`, async () => {
    expectWithinBudget('screenSwitch', await switchTimes(app, SWITCH_ROUNDS))
  })

  it('misses the screen-switch budget when a slowdown is put into the page on purpose', async () => {
    const verdict = await slowSwitches(app)

    expect(verdict.ok, verdict.line).toBe(false)
  })
})

describe('the Flight data screen with telemetry', () => {
  let vehicle: TcpVehicle | undefined
  let app: E2eApp | undefined

  beforeAll(async () => {
    vehicle = await TcpVehicle.start()
    app = await connectedApp(vehicle)
  }, 120_000)

  afterAll(async () => {
    try {
      await app?.close()
    } finally {
      vehicle?.stop()
    }
  })

  it(`has no long task above the budget on the main thread (the longest of each second, ${TELEMETRY_SECONDS} s)`, async () => {
    expectWithinBudget('longTask', await app!.evaluate<number[]>(longestTasks(TELEMETRY_SECONDS)))
  }, (TELEMETRY_SECONDS + 30) * 1000)

  it('misses the long-task budget when a slowdown is put into the page on purpose', async () => {
    const verdict = await slowTicks(app!)

    expect(verdict.ok, verdict.line).toBe(false)
  }, 40_000)
})
