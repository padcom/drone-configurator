// End to end, in the real window: the shell. Every screen can be reached from the navigation, and a switch to a
// screen that has been shown before is quick.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'
import { SWITCH_LIMIT_MS, switchRounds } from './switch'

/** What each screen shows once it is the one shown: an element it has, or the words of a screen not built yet. */
const MARKERS: [id: string, check: string, title: string][] = [
  ['flight', '#telemetry', 'Flight data'],
  ['plan', 'p.not-available', 'Plan'],
  ['setup', 'p.not-available', 'Setup'],
  ['parameters', '#list-status', 'Parameters'],
  ['tune', 'p.not-available', 'Tune'],
  ['logs', 'p.not-available', 'Logs'],
  ['simulation', 'p.not-available', 'Simulation'],
  ['settings', 'p.not-available', 'Settings'],
]

let app: E2eApp

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

/**
 * Shows one screen from the navigation and checks what it must have: its marker, its name in the link, the top bar.
 *
 * @param id the screen
 * @param marker a selector for something only that screen has
 * @param title the name in its link
 */
async function reach(id: string, marker: string, title: string): Promise<void> {
  await showScreen(app, id)
  await app.waitFor(`document.querySelector(${JSON.stringify(marker)}) !== null`)
  expect(await app.text(`nav a[href="#/${id}"]`), id).toBe(title)
  expect(await app.evaluate<boolean>(`document.querySelector('#top-bar') !== null`), id).toBe(true)
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

describe('the shell', () => {
  it('starts on Flight data, with the top bar and the navigation', async () => {
    expect(await app.evaluate<string>('location.hash')).toMatch(/^#\/flight$/u)
    await app.waitForText('#telemetry', 'No telemetry')
    expect(await app.text('#top-bar')).toContain('disconnected')
    expect(await app.evaluate<number>(`document.querySelectorAll('nav a').length`)).toBe(MARKERS.length)
  })

  it('reaches every screen from the navigation, with the top bar always there', async () => {
    await walk(MARKERS)
  })

  it('says under its own name that a screen is not built yet', async () => {
    await showScreen(app, 'tune')
    expect(await app.waitForText('p.not-available', 'Tune is not available yet.')).toBe('Tune is not available yet.')
  })

  it('switches to a screen that has been shown before within 100 ms', async () => {
    // Several switches, to see a run and not one number. The numbers are the point (they say whether 100 ms is
    // realistic on a machine without a GPU), so they are printed.
    const times = await switchRounds(app)
    console.info('screen switch times (ms):', JSON.stringify(times))

    expect(Math.max(...Object.values(times))).toBeLessThan(SWITCH_LIMIT_MS)
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
