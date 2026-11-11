// End to end, in the real window: the favourites. A star in the row (by the mouse, and the key `*` for the selected row), the
// Favourites group that lists them, and that they are kept in the settings file: the window is closed and opened again, and
// the stars are still there (the settings are in the data directory this file's windows share).
import { type E2eApp, launchApp } from './launch'
import { afterAll, describe, expect, it } from 'vitest'
import { clickConnect, showGroups, showScreen } from './click'

let app: E2eApp | undefined

/**
 * Opens the window, connects to the simulated vehicle, and shows the parameters.
 *
 * @returns the window
 */
async function open(): Promise<E2eApp> {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
  await showGroups(app)

  return app
}

/**
 * The names of the parameters that are starred, in the list's order.
 *
 * @param window the window
 * @returns the names
 */
const starred = (window: E2eApp) => window.evaluate<string[]>(
  `[...document.querySelectorAll('#rows tr')]
    .filter(r => r.querySelector('td.star button[aria-pressed="true"]')).map(r => r.dataset.id)`,
)

/**
 * A page expression: the star of a parameter is pressed.
 *
 * @param id the parameter
 * @returns the expression
 */
const pressed = (id: string) => {
  const star = `document.querySelector('tr[data-id="${id}"] td.star button')`

  return `${star}.getAttribute('aria-pressed') === 'true'`
}

afterAll(async () => {
  await app?.close()
})

describe('the favourites', () => {
  it('are starred by the star of the row, which does not select it, and by * for the selected row', async () => {
    const window = await open()
    expect(await starred(window)).toEqual([])

    await window.click('tr[data-id="RTL_ALT"] td.star button')
    await window.waitFor(pressed('RTL_ALT'))
    expect(await window.evaluate<boolean>(`document.querySelector('#rows tr.selected') === null`)).toBe(true)

    await window.click('tr[data-id="BATT_CAPACITY"]')
    await window.evaluate(`document.getElementById('param-list').focus()`)
    await window.press('*')
    await window.waitFor(pressed('BATT_CAPACITY'))
    expect(await starred(window)).toEqual(['BATT_CAPACITY', 'RTL_ALT'])
  })

  it('are listed by the Favourites group, with their count', async () => {
    const window = app as E2eApp
    // The count follows the (optimistic) write of the settings: wait for it, do not read it once.
    await window.waitForText('button[data-group="*favourites"]', /Favourites\s*2/u)

    await window.click('button[data-group="*favourites"]')

    await window.waitForText('#list-status', '2 of 12 parameters')
    expect(await window.evaluate<string[]>(`[...document.querySelectorAll('#rows tr')].map(r => r.dataset.id)`))
      .toEqual(['BATT_CAPACITY', 'RTL_ALT'])
  })
})

describe('the favourites, kept', () => {
  it('are kept: the window is closed and opened again, and the stars are there', async () => {
    expect(await (app as E2eApp).close()).toBe(0)

    const window = await open()

    expect(await starred(window)).toEqual(['BATT_CAPACITY', 'RTL_ALT'])
    await window.waitForText('button[data-group="*favourites"]', /Favourites\s*2/u)
  })

  it('are taken away by the star, and the group says there are none left', async () => {
    const window = app as E2eApp
    await window.click('tr[data-id="BATT_CAPACITY"] td.star button')
    await window.click('tr[data-id="RTL_ALT"] td.star button')

    await window.waitFor(`document.querySelectorAll('td.star button[aria-pressed="true"]').length === 0`)
    await window.click('button[data-group="*favourites"]')
    await window.waitFor(`document.querySelector('#clear-search') !== null`)
    expect(await window.text('.kit-empty')).toMatch(/No favourites yet/u)
  })

  it('closes cleanly', async () => {
    expect(await (app as E2eApp).close()).toBe(0)
  })
})
