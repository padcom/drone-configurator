// End to end, in the real window: the speed of the kit's data table (#15), as the Plan page's Table tool, with the most items a
// plan may have (1,000: the page's own Duplicate stops there). The table is scrolled a few rows a frame, from the top, and the
// time between frames is judged against the `tableScroll` budget (budgets.json): the median within it, the 95th percentile
// within it times its noise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectWithinBudget } from './budgets'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

/** The most items a plan has (lib/plan/model.ts, MAX_ITEMS). */
const ITEMS = 1000
/** How many frames are timed, and how far each scrolls (px: a few rows of 52). */
const FRAMES = 240
const STEP_PX = 120

let app: E2eApp | undefined

/**
 * The app under test.
 *
 * @returns the app
 */
const window = (): E2eApp => app as E2eApp

/** The number of items in the page's list. */
const COUNT = `document.querySelectorAll('.plan-item').length`

/** A page script that scrolls the table a step a frame and gives the time between frames (ms). */
const SCROLLING = `(async () => {
  const area = document.querySelector('.plan-table .data-table-scroll')
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
  area.scrollTop = 0
  await frame()
  await frame()
  const gaps = []
  let last = performance.now()
  for (let i = 0; i < ${FRAMES}; i++) {
    area.scrollTop += ${STEP_PX}
    await frame()
    const now = performance.now()
    gaps.push(now - last)
    last = now
  }
  return gaps
})()`

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'plan')
  await app.waitFor(`document.querySelector('.plan-list') !== null`, 30_000)
  await app.click('[data-command-button="plan.addWaypoint"]')
  await app.waitFor(`${COUNT} === 1`)
  // The rest, by the page's own Duplicate (one script: the page draws once at the end).
  await app.evaluate(`(() => {
    const duplicate = document.querySelector('[data-command-button="plan.duplicate"]')
    for (let i = 1; i < ${ITEMS}; i++) duplicate.click()
  })()`)
  await app.waitFor(`${COUNT} === ${ITEMS}`, 180_000)
  await app.click('#plan-tab-table')
  await app.waitFor(`document.querySelector('.plan-table .data-table-scroll') !== null`)
}, 240_000)

afterAll(async () => {
  await app?.close()
})

describe('the Plan table at its most items', () => {
  it(`has a row for each of the ${ITEMS} items, and draws only those in view`, async () => {
    const counts = await window().evaluate<{ rows: string, drawn: number }>(`({
      rows: document.querySelector('.plan-table [role="grid"]').getAttribute('aria-rowcount'),
      drawn: document.querySelectorAll('.plan-table .data-table-row').length,
    })`)

    expect(counts.rows).toBe(String(ITEMS + 1))
    expect(counts.drawn).toBeLessThan(60)
  })

  it('scrolls at 60 fps: the time between frames within the budget', async () => {
    expectWithinBudget('tableScroll', await window().evaluate<number[]>(SCROLLING))
  }, 60_000)
})
