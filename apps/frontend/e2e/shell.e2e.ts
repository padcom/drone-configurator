// End to end, in the real window: the shell. Every screen can be reached from the navigation, and a switch to a
// screen that has been shown before is quick.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'

/** A switch to a screen that is already loaded must be on the screen within this (the plan: 100 ms). */
const SWITCH_LIMIT_MS = 100

/** What each screen shows once it is the one shown: an element it has, or the words of a screen not built yet. */
const MARKERS: [id: string, check: string, title: string][] = [
  ['flight', '#telemetry', 'Flight data'],
  ['plan', 'p.not-available', 'Plan'],
  ['setup', 'p.not-available', 'Setup'],
  ['tune', 'p.not-available', 'Tune'],
  ['parameters', '#list-status', 'Parameters'],
  ['logs', 'p.not-available', 'Logs'],
  ['simulation', 'p.not-available', 'Simulation'],
]

let app: E2eApp

/**
 * Follows a navigation link and measures how long it takes until the screen's marker is in the page and a frame has
 * been drawn after it.
 *
 * @param id the screen
 * @param marker a selector for something only that screen has
 * @returns the milliseconds from the click to that frame
 */
function switchTime(id: string, marker: string): Promise<number> {
  return app.evaluate<number>(`new Promise(resolve => {
    const started = performance.now()
    document.querySelector('nav a[href="#/${id}"]').click()
    const poll = () => document.querySelector(${JSON.stringify(marker)})
      ? requestAnimationFrame(() => resolve(performance.now() - started))
      : requestAnimationFrame(poll)
    poll()
  })`)
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

/**
 * Shows one screen from the navigation and checks what it must have: its marker, its name in the link, the status bar.
 *
 * @param id the screen
 * @param marker a selector for something only that screen has
 * @param title the name in its link
 */
async function reach(id: string, marker: string, title: string): Promise<void> {
  await showScreen(app, id)
  await app.waitFor(`document.querySelector(${JSON.stringify(marker)}) !== null`)
  expect(await app.text(`nav a[href="#/${id}"]`), id).toBe(title)
  expect(await app.evaluate<boolean>(`document.querySelector('#status-bar') !== null`), id).toBe(true)
}

/**
 * Reaches the screens one after the other (each is loaded when it is first shown, and the clicks must not overlap).
 *
 * @param screens the screens left to reach
 */
async function walk(screens: typeof MARKERS): Promise<void> {
  const [first, ...rest] = screens
  if (first) {
    await reach(...first)
    await walk(rest)
  }
}

/**
 * Switches between two screens that have both been shown, three rounds.
 *
 * @returns each switch's time in milliseconds, by screen and round
 */
async function switchRounds(): Promise<Record<string, number>> {
  const times: Record<string, number> = {}
  for (const round of [1, 2, 3]) {
    // One after the other: the clicks must not overlap.
    // eslint-disable-next-line no-await-in-loop
    times[`parameters ${round}`] = await switchTime('parameters', '#list-status')
    // eslint-disable-next-line no-await-in-loop
    times[`flight ${round}`] = await switchTime('flight', '#telemetry')
  }

  return times
}

describe('the shell', () => {
  it('starts on Flight data, with the status bar and the navigation', async () => {
    expect(await app.evaluate<string>('location.hash')).toMatch(/^#\/flight$/u)
    await app.waitForText('#telemetry', 'No telemetry')
    expect(await app.text('#status-bar')).toContain('disconnected')
    expect(await app.evaluate<number>(`document.querySelectorAll('nav a').length`)).toBe(MARKERS.length)
  })

  it('reaches every screen from the navigation, with the status bar always there', async () => {
    await walk(MARKERS)
  })

  it('says under its own name that a screen is not built yet', async () => {
    await showScreen(app, 'tune')
    expect(await app.waitForText('p.not-available', 'Tune is not available yet.')).toBe('Tune is not available yet.')
  })

  it('switches to a screen that has been shown before within 100 ms', async () => {
    // Several switches, to see a run and not one number. The numbers are the point (they say whether 100 ms is
    // realistic on a machine without a GPU), so they are printed.
    const times = await switchRounds()
    console.info('screen switch times (ms):', JSON.stringify(times))

    expect(Math.max(...Object.values(times))).toBeLessThan(SWITCH_LIMIT_MS)
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
