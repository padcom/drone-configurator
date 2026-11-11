// End to end, in the real window: the scrollbar of the open list of a combobox (the field of names and the field of bits) can be
// pressed and the wheel turned without the list closing. The presses are real mouse events through the host, at the scrollbar.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'

const many = (count: number, label: string) => Object.fromEntries(Array.from({ length: count }, (_, i) => [i, `${label} ${i}`]))
const PDEF = {
  json: { version: 0 },
  ArduCopter: {
    ARMING_CHECK: { Bitmask: many(24, 'Check'), Description: 'Pre-arm checks', DisplayName: 'Arm checks' },
    SERIAL0_BAUD: { Values: many(30, 'Rate'), Description: 'Baud rate', DisplayName: 'Baud' },
  },
}

let app: E2eApp
let files = ''

/**
 * Where the scrollbar of the open list is: the middle of its track, near the bottom, a few pixels inside its right edge.
 *
 * @returns the position in the window
 */
const trackAt = () => app.evaluate<{ x: number, y: number }>(`(() => {
  const box = document.querySelector('#edit [role="listbox"]').getBoundingClientRect()

  return { x: box.right - 4, y: box.bottom - 12 }
})()`)

/**
 * Presses the mouse at a place, as a hand does.
 *
 * @param at the place
 * @param at.x pixels from the left of the window
 * @param at.y pixels from its top
 */
async function press(at: { x: number, y: number }): Promise<void> {
  const event = { ...at, button: 'left', clickCount: 1 }
  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mousePressed', ...event })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseReleased', ...event })
}

const listTop = () => app.evaluate<number>(`document.querySelector('#edit [role="listbox"]').scrollTop`)
const listOpen = () => app.evaluate<boolean>(`document.querySelector('#edit [role="listbox"]') !== null`)

/**
 * Selects a parameter and opens the list of its Value field.
 *
 * @param id the parameter
 */
async function openFieldOf(id: string): Promise<void> {
  await app.click(`tr[data-id="${id}"]`)
  await app.waitFor(`document.querySelector('#draft')?.getAttribute('role') === 'combobox'`)
  await app.click('#draft')
  await app.waitFor(`document.querySelector('#edit [role="listbox"]') !== null`)
}

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
  await app.waitForText('.kit-toast.sev-success', /Loaded descriptions/u)
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

const BOX = `document.querySelector('#edit [role="listbox"]')`
const SCROLLS = `${BOX}.scrollHeight > ${BOX}.clientHeight`
const CLOSED = `document.querySelector('#edit [role="listbox"]') === null`

/** Presses at the scrollbar's track, and drags from there down, as a hand does (the host may draw an overlay scrollbar). */
async function pressTrack(): Promise<void> {
  const at = await trackAt()
  const down = { ...at, button: 'left', clickCount: 1 }

  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mousePressed', ...down })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y - 40, button: 'left' })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseReleased', ...down, y: at.y - 40 })
}

/** Turns the wheel over the list, and waits for it to have scrolled. */
async function turnWheel(): Promise<void> {
  const before = await listTop()
  const at = await trackAt()

  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x - 60, y: at.y - 60, deltaX: 0, deltaY: 80 })
  await app.waitFor(`document.querySelector('#edit [role="listbox"]').scrollTop > ${before}`)
}

/**
 * Clicks the chevron of the open field's input, and waits for the list to be as it is meant to be after.
 *
 * @param opens whether the click is to open the list (else it is to close it); the focus is to stay in the field
 */
async function clickChevron(opens: boolean): Promise<void> {
  await app.click('#edit .chevron-hit')
  await app.waitFor(opens ? `!(${CLOSED})` : CLOSED)

  expect(await app.evaluate<string>('document.activeElement.id')).toBe('draft')
}

/** Presses Escape, as the keyboard does. */
async function escape(): Promise<void> {
  const event = { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

describe.each([['the field of names', 'SERIAL0_BAUD'], ['the field of bits', 'ARMING_CHECK']])('%s', (_, id) => {
  it('has a list that scrolls', async () => {
    await openFieldOf(id)

    expect(await app.evaluate<boolean>(SCROLLS)).toBe(true)
  })

  it('stays open, with the focus in the field, on a press and a drag at the scrollbar', async () => {
    await pressTrack()

    expect(await listOpen()).toBe(true)
    expect(await app.evaluate<string>('document.activeElement.id')).toBe('draft')
  })

  it('scrolls with the wheel, and the list stays open', async () => {
    await turnWheel()

    expect(await listOpen()).toBe(true)
  })

  it('closes on a press outside, and on Escape', async () => {
    await press({ x: 700, y: 700 })
    await app.waitFor(CLOSED)
    await app.click('#draft')
    await app.waitFor(`!(${CLOSED})`)

    await escape()

    await app.waitFor(CLOSED)
  })
})

describe.each([['the field of names', 'SERIAL0_BAUD'], ['the field of bits', 'ARMING_CHECK']])('%s, its chevron', (_, id) => {
  it('opens and closes with a real click, the focus staying in the field', async () => {
    await openFieldOf(id)

    await clickChevron(false)
    await clickChevron(true)
    await clickChevron(false)
  })
})
