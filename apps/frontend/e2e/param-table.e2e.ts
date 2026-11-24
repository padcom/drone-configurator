// End to end, in the real window with the real backend and its simulated vehicle (#36): the parameter table's search by the
// everyday words (in any order, a typo a close match), the keys of the search box, a search over every parameter whatever the
// group, "Modified from default" (the firmware's defaults come with the download by file transfer: the simulated vehicle has
// BATT_CAPACITY and FS_THR_ENABLE away from theirs), the grouping by the metadata, the link to the guided page, the header that
// stays, and the starred and recently used parameters, which are still there after the window is closed and opened again.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type E2eApp, launchApp } from './launch'
import { clickConnect, showGroups, showScreen } from './click'

/** The metadata loaded from a file, in the app's own format: descriptions, who each is for, and ArduPilot's groups. */
const METADATA = {
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: {
    RTL_ALT: { description: 'RTL Altitude', user: 'standard', group: 'RTL_' },
    FS_THR_ENABLE: { description: 'Throttle Failsafe Enable', user: 'advanced', group: 'ArduCopter' },
    BATT_CAPACITY: { description: 'Battery capacity', user: 'standard', group: 'BATT_' },
    BATT_LOW_VOLT: { description: 'Low battery voltage', user: 'standard', group: 'BATT_' },
    PILOT_SPEED_UP: { description: 'Pilot maximum vertical speed ascending', user: 'standard', group: 'ArduCopter' },
  },
}

/** The Down arrow as DevTools sends it (the host's `press` knows the keys that type and a few names). */
const ARROW_DOWN = { windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' }

let app: E2eApp | undefined
let files = ''

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
 * Opens the window, connects to the simulated vehicle, and shows the parameters with their groups.
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
 * The names of the rows, in order.
 *
 * @returns the names
 */
const rows = () => window().evaluate<string[]>(`[...document.querySelectorAll('#rows tr[data-id]')].map(r => r.dataset.id)`)

/**
 * Waits for the list to be exactly these rows.
 *
 * @param expected the rows, in order
 */
async function waitRows(expected: string[]): Promise<void> {
  const shown = `[...document.querySelectorAll('#rows tr[data-id]')].map(r => r.dataset.id).join()`
  await window().waitFor(`${shown} === '${expected.join()}'`)
}

/**
 * Types a search, and waits for the list to be exactly these rows.
 *
 * @param text what is typed
 * @param expected the rows it lists
 */
async function searchFor(text: string, expected: string[]): Promise<void> {
  await window().fill('#filter', text)
  await waitRows(expected)
}

/** Enter in the search opens the result the arrows moved to, and Escape clears the search. */
async function opensAndClears(): Promise<void> {
  await searchFor('batt', ['BATT_CAPACITY', 'BATT_LOW_VOLT'])
  await window().evaluate(`document.getElementById('filter').focus()`)
  await window().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ARROW_DOWN })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...ARROW_DOWN })
  await window().press('Enter')

  await window().waitFor(`document.activeElement?.id === 'param-list'`)
  expect(await window().text('#detail .param-name')).toBe('BATT_LOW_VOLT')

  await window().evaluate(`document.getElementById('filter').focus()`)
  await window().press('Escape')
  await window().waitFor(`document.getElementById('filter').value === ''`)
  await window().waitForText('#list-status', '12 parameters')
}

beforeAll(async () => {
  // Instead of the native file dialog, which a test cannot click (the backend's FileChooser).
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  writeFileSync(join(files, 'open.json'), JSON.stringify(METADATA))
  await open()
  await window().click('#metadata-button')
  await window().waitFor(`document.querySelector('.param-scroll table.described') !== null`)
}, 180_000)

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

describe('the search of the parameter table', () => {
  it('finds a parameter by its everyday words, in any order, and says which words', async () => {
    await searchFor('radio lost', ['FS_THR_ENABLE'])
    expect(await window().text('tr[data-id="FS_THR_ENABLE"] .also')).toContain('Also: radio lost')
    await searchFor('lost radio', ['FS_THR_ENABLE'])
    await searchFor('return height', ['RTL_ALT'])
  })

  it('takes an underscore as a space, and marks a one-letter typo as a close match', async () => {
    await searchFor('batt_capacity', ['BATT_CAPACITY'])
    await searchFor('capacty', ['BATT_CAPACITY'])
    expect(await window().text('tr[data-id="BATT_CAPACITY"] .why')).toMatch(/^close match$/iu)
  })

  it('searches every parameter, whatever the group is', async () => {
    await window().fill('#filter', '')
    await window().click('button[data-group="BATT"]')
    await window().waitForText('#list-status', '2 of 12 parameters')

    await searchFor('radio lost', ['FS_THR_ENABLE'])
  })

  it('opens the result with Enter (the arrows move between them), and clears the search with Escape', opensAndClears)
})

describe('"Modified from default"', () => {
  it('lists the parameters away from the firmware\'s default, and narrows a search too', async () => {
    await window().click('button[data-group=""]')
    await window().click('#modified-only')

    await waitRows(['BATT_CAPACITY', 'FS_THR_ENABLE'])
    await searchFor('batt', ['BATT_CAPACITY'])
  })

  it('says when it hides every match, and turns itself off from there', async () => {
    await window().fill('#filter', 'rtl alt')
    await window().waitForText('.param-scroll', /No modified parameter matches "rtl alt"/u)

    await window().click('#show-unmodified')

    await waitRows(['RTL_ALT'])
    expect(await window().evaluate<boolean>(`document.getElementById('modified-only').checked`)).toBe(false)
    await window().fill('#filter', '')
  })
})

describe('the groups, the detail and the header', () => {
  it('group by the metadata when asked', async () => {
    await window().click('#param-group-by input[value="metadata"]')
    await window().click('button[data-group="ArduCopter"]')

    await waitRows(['FS_THR_ENABLE', 'PILOT_SPEED_UP'])
    await window().click('#param-group-by input[value="name"]')
  })

  it('link a parameter to the guided page that sets it', async () => {
    await searchFor('fs_thr_enable', ['FS_THR_ENABLE'])
    await window().click('tr[data-id="FS_THR_ENABLE"]')
    await window().waitForText('#param-guide', 'Set up in Failsafes')

    await window().click('#param-guide')

    await window().waitFor(`location.hash === '#/setup/failsafes'`)
    await showScreen(window(), 'parameters')
    await window().fill('#filter', '')
  })

  it('keep the column headers in view while the table scrolls', async () => {
    expect(await window().evaluate<string>(`getComputedStyle(document.querySelector('.param-scroll thead th')).position`))
      .toBe('sticky')
  })
})

describe('the starred and the recently used parameters', () => {
  it('are kept after the window is closed and opened again', async () => {
    await window().click('tr[data-id="WPNAV_SPEED"] td.star button')
    await window().click('tr[data-id="LOIT_SPEED"]')
    await window().waitForText('button[data-group="*recent"]', /Recently used\s*[2-9]/u)
    expect(await window().close()).toBe(0)

    await open()

    await window().click('button[data-group="*favourites"]')
    await waitRows(['WPNAV_SPEED'])
    await window().click('button[data-group="*recent"]')
    await window().waitFor(`document.querySelector('#rows tr[data-id]')?.dataset.id === 'LOIT_SPEED'`)
    const recent = await rows()
    expect(recent).toContain('FS_THR_ENABLE')
  })
})
