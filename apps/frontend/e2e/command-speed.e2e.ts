// End to end, in the real window with the real backend and a SCRIPTED vehicle that has 1,500 parameters behind a TCP port: the
// command palette's speed budget and its keyboard-only way to a parameter. The palette opens within 50 ms of the key (the first
// frame after it has the search box, with the focus in it); every keystroke of a query is answered within 16 ms (the rows are in
// the page by the next task; painting them is the browser's). The times are measured IN the page, from the key event, so the
// host's own delays are not in them; they are the median and the 95th percentile of many presses, not one. Then the way a person
// without a mouse goes: Ctrl+P, type the name with the keys, Enter, and the Parameters screen has the parameter selected, the
// focus in its editor.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectWithinBudget } from './budgets'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { chord, openPalette } from './palette-keys'
import { ScriptedVehicle } from './scripted-vehicle'

/** How many parameters the vehicle has. The budgets are `paletteOpen` and `paletteKeystroke` in budgets.json (#22). */
const PARAMETERS = 1500
/**
 * How many openings are timed, after the ones that warm it up. They are judged as every budget is (e2e/budgets.ts): the MEDIAN
 * against the budget and the 95th percentile against the budget times its noise, since with a few dozen samples the 95th
 * percentile is the second slowest, and one cold or descheduled frame must not fail the build, while a palette that is slow for
 * every other press still does.
 */
const OPENINGS = 25
const WARM_UP_OPENINGS = 5

let vehicle: ScriptedVehicle | undefined
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
 * The names of the parameters: letters and digits only, so that a person (and this test) types them with keys.
 *
 * @returns the names, PRM0001 to PRM1500
 */
function names(): Record<string, number> {
  return Object.fromEntries(Array.from({ length: PARAMETERS }, (_, i) => [`PRM${String(i + 1).padStart(4, '0')}`, i]))
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  vehicle.params(names())
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', `${PARAMETERS} parameters`, 120_000)
  await showScreen(app, 'flight')
}, 240_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

/** Presses Ctrl+P as a page script does, and the page's way to wait for the next frame. */
const PRELUDE = `
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
  const ctrlP = () => window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', ctrlKey: true, bubbles: true, cancelable: true }),
  )
`

/**
 * Opens the palette a few times to warm it up (the first opening is cold: the dialog, the fonts, the code) and then ${OPENINGS}
 * times, and says how long each of those took to show it with the focus in its box.
 */
const OPENING = `(async () => {
  ${PRELUDE}
  const times = []
  for (let i = 0; i < ${WARM_UP_OPENINGS + OPENINGS}; i++) {
    const start = performance.now()
    ctrlP()
    await frame()
    const took = document.activeElement?.id === 'palette-input' ? performance.now() - start : Infinity
    if (i >= ${WARM_UP_OPENINGS}) {
      times.push(took)
    }
    ctrlP()
    await frame()
    await frame()
  }
  return times
})()`

/**
 * A page script that types the text a letter at a time into the open palette's box and says how long each letter took until the
 * rows had been made (the next task), and what the first row is at the end.
 *
 * @param text what is typed
 * @returns the script, which gives the times and the first row's command
 */
function typing(text: string): string {
  return `(async () => {
    ${PRELUDE}
    ctrlP()
    await frame()
    const input = document.querySelector('#palette-input')
    const times = []
    for (let i = 1; i <= ${JSON.stringify(text)}.length; i++) {
      const start = performance.now()
      input.value = ${JSON.stringify(text)}.slice(0, i)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      times.push(performance.now() - start)
    }
    const first = document.querySelector('.palette-row')?.dataset.command
    ctrlP()
    await frame()
    return { times, first }
  })()`
}

/**
 * Says the times in the run's log, rounded.
 *
 * @param what what was timed
 * @param times the times, in ms
 */
function say(what: string, times: number[]): void {
  console.info(`${what} (ms):`, JSON.stringify(times.map(Math.round)))
}

/** What typing a query gave: the time of each keystroke, and the first row at the end. */
interface Typed {
  times: number[]
  first: string
}

/**
 * Types each query into the palette once (one after the other: the page does one thing at a time).
 *
 * @param queries what is typed
 * @returns what each gave
 */
async function typedOnce(queries: string[]): Promise<Typed[]> {
  const runs: Typed[] = []
  for (const query of queries) {
    // eslint-disable-next-line no-await-in-loop
    runs.push(await window().evaluate<Typed>(typing(query)))
  }

  return runs
}

/**
 * Types the queries once to warm the palette up (the first keystrokes are cold: not timed), then `rounds` times, timed.
 *
 * @param queries what is typed
 * @param rounds how many timed rounds
 * @returns the time of every keystroke, and the first row each query ended with
 */
async function typedAll(queries: string[], rounds: number): Promise<{ times: number[], firsts: string[] }> {
  await typedOnce(queries)
  const times: number[] = []
  let firsts: string[] = []
  for (let round = 0; round < rounds; round++) {
    // eslint-disable-next-line no-await-in-loop
    const runs = await typedOnce(queries)
    runs.forEach(run => times.push(...run.times))
    firsts = runs.map(run => run.first)
  }

  return { times, firsts }
}

describe('the speed of the palette, with 1,500 parameters loaded', () => {
  it('opens within 50 ms of the key, with the focus in the search box (the median of 25; the 95th in twice)', async () => {
    const times = await window().evaluate<number[]>(OPENING)

    say('palette open', times)
    expectWithinBudget('paletteOpen', times)
  })

  it('answers each keystroke within 16 ms: the rows are made by the next task (the median; the 95th in twice)', async () => {
    const { times, firsts } = await typedAll(['PRM0777', 'PRM1', 'prm00', 'switch to param'], 3)

    say('palette keystroke', times)
    expectWithinBudget('paletteKeystroke', times)
    expect(firsts[0]).toBe('param.PRM0777')
  })
})

describe('from the palette to a parameter with the keyboard only', () => {
  it('goes to the parameter that was typed: Ctrl+P, its name, Enter, and the focus is in its editor', async () => {
    await openPalette(window())

    for (const key of 'prm0777') {
      // eslint-disable-next-line no-await-in-loop
      await window().press(key)
    }
    await window().waitFor(`document.querySelector('.palette-row')?.dataset.command === 'param.PRM0777'`)

    await chord(window(), 'Enter')

    await window().waitFor(`location.hash === '#/parameters' && document.activeElement?.id === 'draft'`)
    expect(await window().evaluate<string>(`document.querySelector('#detail .param-name').textContent`)).toBe('PRM0777')
  })

  it('closes cleanly', async () => {
    expect(await window().close()).toBe(0)
  })
})
