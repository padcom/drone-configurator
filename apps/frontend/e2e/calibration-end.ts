// How a calibration ended is a toast (the first words of its text say how), so the specs of the calibration pages read it there.
import type { E2eApp } from './launch'

/** How each outcome starts the text of its toast. */
const WORDS: Readonly<Record<string, string>> = {
  success: 'Calibration done',
  failed: 'Calibration failed',
  cancelled: 'Calibration cancelled',
  refused: 'Calibration not started',
}

/**
 * The page's expression: the texts of the toasts.
 *
 * @returns JavaScript
 */
const texts = (): string => `[...document.querySelectorAll('.kit-toast .text')].map(text => text.textContent)`

/**
 * Waits until the toast of an outcome is shown.
 *
 * @param app the app
 * @param outcome `success`, `failed`, `cancelled` or `refused`
 * @param timeoutMs how long to wait
 */
export async function waitForEnd(app: E2eApp, outcome: string, timeoutMs = 60_000): Promise<void> {
  await app.waitFor(`${texts()}.some(text => text.startsWith(${JSON.stringify(WORDS[outcome])}))`, timeoutMs)
}

/**
 * Waits for the toast of the end of a calibration and says how it ended.
 *
 * @param app the app
 * @param timeoutMs how long to wait
 * @returns `success`, `failed`, `cancelled` or `refused`
 */
export async function endOf(app: E2eApp, timeoutMs = 60_000): Promise<string> {
  await app.waitFor(`${texts()}.some(text => text.startsWith('Calibration '))`, timeoutMs)
  const shown = await app.evaluate<string[]>(texts())

  return Object.entries(WORDS).find(([, words]) => shown.some(text => text.startsWith(words)))?.[0] ?? ''
}
