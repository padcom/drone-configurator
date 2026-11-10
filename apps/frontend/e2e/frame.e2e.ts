// End to end, in the real window: the frame. From 1000 px wide the page itself does not scroll (only the screen does) and the
// rail stands at the left; below that the rail lies down on top.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let app: E2eApp

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

/**
 * Sizes the window's viewport.
 *
 * @param width its width in pixels
 * @param height its height in pixels
 */
async function size(width: number, height: number): Promise<void> {
  await app.devtools('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
}

/**
 * Whether the page could be scrolled, and where the rail is.
 *
 * @returns the page's overflow and the rail's box
 */
function measure(): Promise<{ overflow: number, railLeft: number, railTop: number, railWidth: number }> {
  return app.evaluate(`(() => {
    const page = document.scrollingElement
    const rail = document.querySelector('.rail').getBoundingClientRect()
    return { overflow: page.scrollHeight - page.clientHeight, railLeft: rail.left, railTop: rail.top, railWidth: rail.width }
  })()`)
}

/** Runs in the page: scrolls each rail link into view and says (by its href) whether a click at its middle would hit it. */
const REACH_EACH_ITEM = `(() => {
  const reach = a => {
    a.scrollIntoView({ block: 'nearest' })
    const box = a.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)

    return a.contains(hit) ? a.getAttribute('href') : ''
  }

  return [...document.querySelectorAll('.rail a')].map(reach)
})()`

describe('the frame at 1000 px and wider', () => {
  it.each([[1440, 900], [1000, 700]])('does not scroll the page at %i x %i, and has the rail at the left', async (w, h) => {
    await size(w, h)
    const m = await measure()

    expect(m.overflow).toBeLessThanOrEqual(0)
    expect(m.railLeft).toBe(0)
    expect(m.railWidth).toBe(76)
  })
})

describe('the rail in a short window', () => {
  it('can reach every item at 1000 x 700, the last one (Settings) included', async () => {
    await size(1000, 700)
    const reached = await app.evaluate<string[]>(REACH_EACH_ITEM)

    expect(reached).not.toContain('')
    expect(reached.at(-1)).toBe('#/settings')
  })
})

describe('the frame below 1000 px', () => {
  it('lays the rail down on top, wider than its 76 px', async () => {
    await size(999, 700)
    const m = await measure()

    expect(m.railWidth).toBeGreaterThan(76)
    expect(m.railTop).toBeGreaterThanOrEqual(0)
  })
})
