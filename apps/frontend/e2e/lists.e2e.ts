// End to end, in the real window: the lists of the Parameters screen. A field of names keeps its highlighted option in view as
// the keys move it (and moves by a page); choosing a group clears the search; how a metadata file went is a toast; every
// scrollable box has the one thin scrollbar; and the line under a row is one colour in every cell and every state.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect, showGroups, showScreen } from './click'

const NAMES = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i), `Choice number ${i}`]))
const METADATA = {
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: { RTL_ALT: { description: 'Return altitude', values: NAMES }, BATT_CAPACITY: { description: 'Battery capacity' } },
}

/** The virtual key codes of the keys that move through a list. */
const CODES: Record<string, number> = { ArrowDown: 40, ArrowUp: 38, PageDown: 34, PageUp: 33 }

let app: E2eApp
let files = ''

/**
 * Loads a metadata file through the dialog stand-in.
 *
 * @param content what the file holds
 */
async function loadMetadata(content: string): Promise<void> {
  writeFileSync(join(files, 'open.json'), content)
  await app.click('#metadata-button')
}

/**
 * Presses a key and lets go, as the keyboard does, and waits two frames.
 *
 * @param key the key
 */
async function press(key: string): Promise<void> {
  const event = { key, code: key, windowsVirtualKeyCode: CODES[key] }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
  await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
}

/**
 * Whether the highlighted option of the open list is inside the list's box.
 *
 * @returns whether it is, and which option it is
 */
const highlight = () => app.evaluate<{ inView: boolean, at: string }>(`(() => {
  const list = document.querySelector('.enum-field .listbox').getBoundingClientRect()
  const option = document.getElementById(document.querySelector('#draft').getAttribute('aria-activedescendant'))
  const box = option.getBoundingClientRect()

  return { inView: box.top >= list.top - 1 && box.bottom <= list.bottom + 1, at: option.textContent }
})()`)

/**
 * Presses the keys one after the other, and says, for each, whether the highlighted option was in view afterwards.
 *
 * @param keys the keys
 * @returns what was seen after each
 */
const pressed = (keys: string[]) => keys.reduce<Promise<boolean[]>>(
  async (seen, key) => {
    const before = await seen
    await press(key)

    return [...before, (await highlight()).inView]
  },
  Promise.resolve([]),
)

beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
  await showGroups(app)
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

describe('how a metadata file went', () => {
  it('is told by an error toast for a file that matches none of the parameters, and by no line of text', async () => {
    await loadMetadata(JSON.stringify({ ...METADATA, params: { NOT_HERE: { description: 'x' } } }))

    expect(await app.waitForText('.kit-toast.sev-error', /^0 of 12 parameters matched/u)).toMatch(/none of the 1/u)
    expect(await app.evaluate<boolean>(`document.querySelector('#metadata-status') === null`)).toBe(true)
  })

  it('is told by a success toast for a file that does', async () => {
    await loadMetadata(JSON.stringify(METADATA))

    await app.waitForText('.kit-toast.sev-success', 'Loaded descriptions for 2 of 12 parameters')
  })
})

describe('a field of names', () => {
  it('keeps the highlighted option in view, one row or one page at a time', async () => {
    await app.click('tr[data-id="RTL_ALT"]')
    await app.waitFor(`document.querySelector('.enum-field #draft') !== null`)
    await app.evaluate(`document.querySelector('#draft').focus()`)
    await app.waitFor(`document.querySelector('.enum-field .listbox') !== null`)

    const seen = await pressed(['ArrowDown', 'ArrowDown', 'PageDown', 'PageDown', 'PageDown', 'ArrowDown', 'PageUp', 'ArrowUp'])

    expect(seen).toEqual(Array.from<boolean>({ length: 8 }).fill(true))
    await pressed(['PageDown', 'PageDown'])
    // Far down the list: an option that the list does not show at first.
    expect(Number((await highlight()).at.match(/\d+/u)?.[0])).toBeGreaterThan(8)
  })
})

describe('the search by what a parameter does', () => {
  it('finds a parameter by a word of its description, marks the words, and calls a typo a close match', async () => {
    await app.evaluate(`document.activeElement.blur()`)
    await app.fill('#filter', 'return altitude')

    await app.waitForText('#list-status', '1 of 12 parameters')
    const ids = `[...document.querySelectorAll('#rows tr')].map(r => r.dataset.id)`
    const marks = `[...document.querySelectorAll('#rows tr .meaning mark')].map(m => m.textContent.toLowerCase())`
    expect(await app.evaluate<string[]>(ids)).toEqual(['RTL_ALT'])
    expect(await app.evaluate<string[]>(marks)).toEqual(['return', 'altitude'])

    await app.fill('#filter', 'batery')
    await app.waitForText('#list-status', '1 of 12 parameters')
    expect(await app.text('tr[data-id="BATT_CAPACITY"] .why')).toMatch(/close match/iu)
    await app.fill('#filter', '')
    await app.waitForText('#list-status', '12 parameters')
  })
})

describe('the groups', () => {
  it('clear the search when one is chosen, and keep a search that is typed after', async () => {
    await app.evaluate(`document.activeElement.blur()`)
    await app.fill('#filter', 'rtl')
    await app.waitForText('#list-status', '1 of 12 parameters')

    await app.click('button[data-group="BATT"]')

    await app.waitForText('#list-status', '2 of 12 parameters')
    expect(await app.evaluate<string>(`document.querySelector('#filter').value`)).toBe('')
    await app.fill('#filter', 'cap')
    await app.waitForText('#list-status', '1 of 12 parameters')
    await app.click('button[data-group=""]')
    await app.waitForText('#list-status', '12 parameters')
  })
})

describe('the look of the lists', () => {
  it('has the one thin scrollbar in every scrollable box', async () => {
    // The description box is there for a parameter that has a description.
    await app.click('tr[data-id="RTL_ALT"]')
    await app.waitFor(`document.querySelector('#param-description .body') !== null`)
    const widths = await app.evaluate<Record<string, string>>(`Object.fromEntries(
      ['.param-groups', '.param-scroll', '.detail', '#param-description .body', '.app-main']
        .map(selector => [selector, getComputedStyle(document.querySelector(selector)).scrollbarWidth]))`)

    expect(Object.values(widths)).toEqual(['thin', 'thin', 'thin', 'thin', 'thin'])
  })

  it('has the same line under every cell of a row: normal, hovered, selected, and with the focus in the list', async () => {
    const lines = `(selector) => [...document.querySelector(selector).children].map(c => getComputedStyle(c).borderBottomColor)`
    await app.click('tr[data-id="BATT_CAPACITY"]')
    await app.evaluate(`document.getElementById('param-list').focus()`)
    const selected = await app.evaluate<string[]>(`(${lines})('tr[data-id="BATT_CAPACITY"]')`)
    const normal = await app.evaluate<string[]>(`(${lines})('tr[data-id="LOIT_SPEED"]')`)

    expect(new Set(selected).size).toBe(1)
    expect(new Set(normal).size).toBe(1)
    expect(selected[0]).toBe(normal[0])
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
