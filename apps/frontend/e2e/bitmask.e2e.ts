// End to end, in the real window: the Value field of a parameter whose metadata has bits (ARMING_CHECK, a Bitmask in
// ArduPilot's definition file). The field is a number with a list of boxes, one for each named bit; the keys are real key events.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cancelConfirm, clickConnect, showScreen } from './click'

const PDEF = {
  json: { version: 0 },
  ArduCopter: {
    ARMING_CHECK: {
      Bitmask: { 0: 'All', 1: 'Barometer', 2: 'Compass', 3: 'GPS lock', 4: 'INS' },
      // The bits win over these.
      Values: { 0: 'Disabled', 1: 'Enabled' },
      Description: 'Allows enabling or disabling of pre-arming checks',
      DisplayName: 'Arm Checks to Perform (bitmask)',
    },
  },
}

const KEYS: Record<string, [number, string]> = {
  ' ': [32, 'Space'],
  'Enter': [13, 'Enter'],
  'Escape': [27, 'Escape'],
  'End': [35, 'End'],
  'Home': [36, 'Home'],
  'ArrowDown': [40, 'ArrowDown'],
}

/** Ctrl is bit 2 of the modifiers of the DevTools key events. */
const CTRL = 2

let app: E2eApp
let files = ''

/**
 * Presses a key and lets go of it, as the keyboard does: a real key event through the host.
 *
 * @param key the key
 * @param modifiers the DevTools modifier bits, none by default
 */
async function chord(key: string, modifiers = 0): Promise<void> {
  const [code, name] = KEYS[key] as [number, string]
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: name, modifiers }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

const OPTIONS = `document.querySelectorAll('#edit [role="option"]')`
const LIST = `document.querySelector('#edit [role="listbox"]')`

// The number in the Value field, the bits the list shows as set, the rows the list has, and how many changes are queued.
const draft = () => app.evaluate<number>(`Number(document.querySelector('#draft').value)`)
const ticked = () => app.evaluate<boolean[]>(`[...${OPTIONS}].map(o => o.getAttribute('aria-selected') === 'true')`)
const names = () => app.evaluate<string[]>(`[...${OPTIONS}].map(o => o.innerText.replace(/\\s+/gu, ' '))`)
const queued = () => app.evaluate<number>(`document.querySelectorAll('#staged .staged-row').length`)
const closed = () => app.evaluate<boolean>(`${LIST} === null`)

beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
  writeFileSync(join(files, 'open.json'), JSON.stringify(PDEF))
  await app.click('#metadata-button')
  await app.waitForText('.kit-toast.sev-success', /Loaded descriptions for 1 of 12 parameters/u)
  await app.click('tr[data-id="ARMING_CHECK"]')
  await app.waitFor(`document.querySelector('#draft') !== null`)
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

describe('the field of bits', () => {
  it('is a combobox with the number and a summary, and opens a list with a box for every bit', async () => {
    expect(await app.evaluate<string>(`document.querySelector('#draft').getAttribute('role')`)).toBe('combobox')
    expect(await app.text('.bit-summary')).toMatch(/bit/u)

    await app.click('#draft')

    expect(await names()).toEqual(['All bit 0', 'Barometer bit 1', 'Compass bit 2', 'GPS lock bit 3', 'INS bit 4'])
    expect(await app.evaluate<string>(`${LIST}.getAttribute('aria-multiselectable')`)).toBe('true')
  })

  it('changes the number as a box is clicked, and queues nothing while the list is open', async () => {
    const before = await draft()
    const [, , , gps] = await ticked()

    await app.click('#edit [role="option"]:nth-child(4)')

    expect(await draft()).toBe(gps ? before - 8 : before + 8)
    expect((await ticked())[3]).toBe(!gps)
    expect(await queued()).toBe(0)
  })
})

describe('the keys of the field of bits', () => {
  it('move with the arrows, toggle with Space, and queue with Enter', async () => {
    const before = await draft()
    await chord('Home')
    await chord('ArrowDown')
    await chord('ArrowDown')
    const [, , compass] = await ticked()
    await chord(' ')

    expect(await draft()).toBe(compass ? before - 4 : before + 4)
    expect(await queued()).toBe(0)
    await chord('Enter')
    await app.waitFor(`document.querySelector('#staged .staged-row[data-id="ARMING_CHECK"]') !== null`)

    expect(await closed()).toBe(true)
  })

  it('close with Escape and keep the value, and go on to Write with Ctrl+Enter', async () => {
    await chord('End')
    await chord(' ')
    const kept = await draft()
    await chord('Escape')

    expect(await closed()).toBe(true)
    expect(await draft()).toBe(kept)
    expect(await app.evaluate<string>('document.activeElement.id')).toBe('draft')

    await chord('Enter', CTRL)
    await app.waitForText('#question', /Write 1 parameter to the vehicle\?\nARMING_CHECK \d+ → \d+/u)
    await cancelConfirm(app)
  })
})
