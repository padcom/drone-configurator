// Timing the switch from one screen to another, in the real window (shell.e2e.ts, flight-data.e2e.ts).
import type { E2eApp } from './launch'

/** A switch to a screen that is already loaded must be on the screen within this (the plan: 100 ms). */
export const SWITCH_LIMIT_MS = 100

/**
 * Follows a navigation link and measures how long it takes until the screen's marker is in the page and a frame has
 * been drawn after it.
 *
 * @param app the running app
 * @param id the screen
 * @param marker a selector for something only that screen has
 * @returns the milliseconds from the click to that frame
 */
export function switchTime(app: E2eApp, id: string, marker: string): Promise<number> {
  return app.evaluate<number>(`new Promise(resolve => {
    const started = performance.now()
    document.querySelector('nav a[href="#/${id}"]').click()
    const poll = () => document.querySelector(${JSON.stringify(marker)})
      ? requestAnimationFrame(() => resolve(performance.now() - started))
      : requestAnimationFrame(poll)
    poll()
  })`)
}

/**
 * Switches between Parameters and Flight data, three rounds (both must have been shown before: a screen is loaded when it
 * is first shown).
 *
 * @param app the running app
 * @returns each switch's time in milliseconds, by screen and round
 */
export async function switchRounds(app: E2eApp): Promise<Record<string, number>> {
  const times: Record<string, number> = {}
  for (const round of [1, 2, 3]) {
    // One after the other: the clicks must not overlap.
    // eslint-disable-next-line no-await-in-loop
    times[`parameters ${round}`] = await switchTime(app, 'parameters', '#list-status')
    // eslint-disable-next-line no-await-in-loop
    times[`flight ${round}`] = await switchTime(app, 'flight', '#telemetry')
  }

  return times
}
