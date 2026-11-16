// End to end, in the real window with no vehicle: the Plan page's list on the keyboard, and the jumps that name items. The arrow
// keys move the selection by one item and stop at the ends (Home and End go to the ends), the real keys as the host receives
// them; and a jump keeps naming the item it was given when that item is moved, taken out and brought back with Undo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

let app: E2eApp | undefined

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

/** The rows of the list of items, as text. */
const ROWS = `[...document.querySelectorAll('.plan-item')].map(row => row.innerText.replace(/\\s+/gu, ' ').trim())`

/** The place of the selected row in the list (from 0), or -1. */
const SELECTED = `[...document.querySelectorAll('.plan-item')].findIndex(row => row.getAttribute('aria-pressed') === 'true')`

/** The virtual key codes of the keys that are pressed. */
const KEYS: Record<string, number> = { ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35 }

/**
 * Presses a key as the host receives it.
 *
 * @param key the key
 */
async function press(key: string): Promise<void> {
  const code = KEYS[key] as number
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: key, modifiers: 0 }
  await window().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/**
 * Presses a key, and waits until the selected row is the one expected (and a moment more, to see that it stays there).
 *
 * @param key the key
 * @param row the row that is selected after it (from 0)
 */
async function pressAndExpect(key: string, row: number): Promise<void> {
  await press(key)
  await window().waitFor(`${SELECTED} === ${row}`, 5000)
  await window().evaluate<void>(`new Promise(resolve => setTimeout(resolve, 150))`)

  expect(await window().evaluate<number>(SELECTED), `${key} -> ${row}`).toBe(row)
  const focused = `document.activeElement === document.querySelectorAll('.plan-item')[${row}]`

  expect(await window().evaluate<boolean>(focused)).toBe(true)
}

/**
 * Waits until the list has this many items.
 *
 * @param count how many
 */
async function waitForItems(count: number): Promise<void> {
  await window().waitFor(`document.querySelectorAll('.plan-item').length === ${count}`, 15_000)
}

/**
 * Presses a button of the list by the command it runs, and waits for the answer of the page.
 *
 * @param command the command's id
 */
async function pressButton(command: string): Promise<void> {
  await window().click(`[data-command-button="${command}"]`)
}

/**
 * Selects a row with the pointer.
 *
 * @param row the row (from 1)
 */
async function selectRow(row: number): Promise<void> {
  await window().click(`.plan-items li:nth-child(${row}) .plan-item`)
  await window().waitFor(`${SELECTED} === ${row - 1}`)
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'plan')
  await app.waitFor(`document.querySelector('.plan-list') !== null`, 30_000)
}, 120_000)

afterAll(async () => {
  await app?.close()
})

describe('the list on the keyboard', () => {
  it('moves the selection by one item with the arrow keys, and stops at the ends', async () => {
    for (let count = 1; count <= 6; count += 1) {
      // eslint-disable-next-line no-await-in-loop -- one item after the other, each waited for
      await pressButton('plan.addWaypoint')
      // eslint-disable-next-line no-await-in-loop -- see above
      await waitForItems(count)
    }
    await selectRow(1)

    for (const row of [1, 2, 3, 4, 5, 5]) {
      // eslint-disable-next-line no-await-in-loop -- the keys are pressed one by one, each checked
      await pressAndExpect('ArrowDown', row)
    }
  })

  it('goes back up by one item, to the ends with Home and End, and stops at the top', async () => {
    const steps = [['ArrowUp', 4], ['ArrowUp', 3], ['Home', 0], ['ArrowUp', 0], ['End', 5], ['End', 5], ['ArrowDown', 5]] as const
    for (const [key, row] of steps) {
      // eslint-disable-next-line no-await-in-loop -- the keys are pressed one by one, each checked
      await pressAndExpect(key, row)
    }
  })
})

describe('the list on the keyboard, from the row that has the focus', () => {
  it('moves from the row that has the focus, also when the selection is on another (an item was added meanwhile)', async () => {
    await window().evaluate(`document.querySelectorAll('.plan-item')[1].focus()`)
    await pressAndExpect('ArrowDown', 2)
    await pressAndExpect('ArrowDown', 3)
    await window().evaluate(`document.querySelectorAll('.plan-item')[0].focus()`)
    await pressAndExpect('ArrowDown', 1)
  })
})

describe('a jump in the window', () => {
  it('puts a jump after the six items and gives it a target', async () => {
    await selectRow(6)
    await window().fill('.plan-add-other select', '177')
    await waitForItems(7)
    await window().fill('#plan-field-jumpTo', '2')
    await window().waitFor(`${ROWS}[6] === '7 Jump to an item 2'`)
  })

  it('keeps naming the same item when the items before it are moved, and again after Undo', async () => {
    await selectRow(1)
    await pressButton('plan.moveDown')
    // (items 1 and 2 swapped: what was item 2 is item 1)
    await window().waitFor(`${ROWS}[6] === '7 Jump to an item 1'`)
    await pressButton('plan.undo')
    await window().waitFor(`${ROWS}[6] === '7 Jump to an item 2'`)
  })

  it('has no target when its item is taken out, and has it again after Undo', async () => {
    await selectRow(2)
    await pressButton('plan.delete')
    await waitForItems(6)
    await window().waitFor(`${ROWS}[5] === '6 Jump to an item'`)
    await pressButton('plan.undo')
    await waitForItems(7)
    await window().waitFor(`${ROWS}[6] === '7 Jump to an item 2'`)
  })
})

describe('a jump that items are put in before', () => {
  it('moves with the items that are put in before its target', async () => {
    await selectRow(1)
    await pressButton('plan.addWaypoint')
    await waitForItems(8)
    // (a new item at place 2: the target 2 is item 3 now)
    await window().waitFor(`${ROWS}[7] === '8 Jump to an item 3'`)
    await pressButton('plan.undo')
    await window().waitFor(`${ROWS}[6] === '7 Jump to an item 2'`)
  })
})
