// End to end, in the real window, no vehicle: a switch keeps its track whatever its label does. A label that wraps over several
// lines (Settings has long ones: "Load the parameters metadata when the application starts", and the same in every language) took
// the width of the track, and the knob of a switch that was on left its rounded border. In every language and at 1440x768,
// 1000x700 and 999x700, every switch of Settings (off, and on once they are all turned on) has its track at its own size and its
// knob inside it, and the track is not shorter than the knob's travel.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

let app: E2eApp | undefined

const LANGUAGES = ['en', 'de', 'pl', 'it', 'es', 'uk', 'ru']
const SIZES = [{ width: 1440, height: 768 }, { width: 1000, height: 700 }, { width: 999, height: 700 }]

/** What every switch of the page looks like: its track's size, and whether its knob is inside the track. */
const LOOK = `JSON.stringify([...document.querySelectorAll('.kit-toggle')].map(toggle => {
  const track = toggle.querySelector('.track').getBoundingClientRect()
  const thumb = toggle.querySelector('.thumb').getBoundingClientRect()
  const label = toggle.lastElementChild.getBoundingClientRect()
  return {
    label: toggle.textContent.trim().slice(0, 40),
    on: toggle.getAttribute('aria-checked') === 'true',
    width: Math.round(track.width * 10) / 10,
    height: Math.round(track.height * 10) / 10,
    inside: thumb.left >= track.left - 0.5 && thumb.right <= track.right + 0.5
      && thumb.top >= track.top - 0.5 && thumb.bottom <= track.bottom + 0.5,
    lines: Math.round(label.height / 20),
  }
}))`

/** Turns every switch on as far as the page can see (the attribute its style reads), remembering what each was; and back. */
const FORCE_ON = `(() => {
  window.__switches = [...document.querySelectorAll('.kit-toggle')].map(toggle => [toggle, toggle.getAttribute('aria-checked')])
  window.__switches.forEach(([toggle]) => toggle.setAttribute('aria-checked', 'true'))
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
})()`
const RESTORE = `(() => {
  (window.__switches ?? []).forEach(([toggle, was]) => toggle.setAttribute('aria-checked', was))
  window.__switches = []
})()`

/** What `LOOK` says of one switch. */
interface Look {
  label: string
  on: boolean
  width: number
  height: number
  inside: boolean
  lines: number
}

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
 * Looks at the switches of the page now.
 *
 * @returns each switch's look
 */
async function looks(): Promise<Look[]> {
  return JSON.parse(await window().evaluate<string>(LOOK)) as Look[]
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('.kit-toggle') !== null`, 60_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

/**
 * Picks the language and waits for the page to say it.
 *
 * @param code the language
 */
async function pick(code: string): Promise<void> {
  await window().waitFor(`document.querySelector('main select[id$="-language"]') !== null`, 30_000)
  await window().fill('main select[id$="-language"]', code)
  await window().waitFor(`document.documentElement.lang === ${JSON.stringify(code)}`, 30_000)
}

/**
 * What is wrong with the switches at one size: a track that is not 36 by 20, or a knob that is not inside it.
 *
 * @param size the window's size
 * @param size.width the width
 * @param size.height the height
 * @returns the switches that are wrong, with what they look like
 */
async function wrongAt(size: { width: number, height: number }): Promise<Look[]> {
  await window().devtools('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false })
  await window().evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const off = await looks()
  // (every switch turned on for a moment, as the page's own attribute says it, without changing any setting: the knob is at the
  // other end of the track then)
  await window().evaluate(FORCE_ON)
  const on = await looks()
  await window().evaluate(RESTORE)

  return [...off, ...on].filter(look => look.width !== 36 || look.height !== 20 || !look.inside)
}

/**
 * Checks the switches at one size, in one language.
 *
 * @param code the language
 * @param size the window's size
 * @param size.width the width
 * @param size.height the height
 */
async function expectRight(code: string, size: { width: number, height: number }): Promise<void> {
  expect(await wrongAt(size), `${code} at ${size.width}x${size.height}`).toEqual([])
  expect((await looks()).length, `${code}: the switches of Settings are there`).toBeGreaterThan(3)
}

it.each(LANGUAGES)('keeps every switch of Settings at its size, with its knob inside, in %s', async code => {
  await pick(code)

  for (const size of SIZES) {
    // eslint-disable-next-line no-await-in-loop -- one size after the other
    await expectRight(code, size)
  }
  await window().devtools('Emulation.clearDeviceMetricsOverride', {})
})

it('has a switch whose label wraps, so that the check above is of the case that broke', async () => {
  await pick('en')
  await window().devtools('Emulation.setDeviceMetricsOverride', { width: 999, height: 700, deviceScaleFactor: 1, mobile: false })
  await window().evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')

  expect((await looks()).some(look => look.lines > 1)).toBe(true)
  await window().devtools('Emulation.clearDeviceMetricsOverride', {})
})
