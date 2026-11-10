// End to end, in the real window: the keyboard of the Parameters screen, with real key events (through the host, as the
// keyboard's are). The simulated vehicle has a dozen parameters. The order matters: each test starts where the one before left
// the focus and the selection.
import { setTimeout as sleep } from 'node:timers/promises'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cancelConfirm, clickConnect, confirmWrite, showScreen } from './click'

let app: E2eApp

/** Ctrl is bit 2 of the modifiers of the DevTools key events. */
const CTRL = 2

/** The virtual key codes and names of the keys the driver's `press` does not know (it has no arrows and no modifiers). */
const CODES: Record<string, [number, string]> = {
  '/': [191, 'Slash'],
  'Enter': [13, 'Enter'],
  'Escape': [27, 'Escape'],
  'PageUp': [33, 'PageUp'],
  'PageDown': [34, 'PageDown'],
  'End': [35, 'End'],
  'Home': [36, 'Home'],
  'ArrowUp': [38, 'ArrowUp'],
  'ArrowDown': [40, 'ArrowDown'],
}

/**
 * Presses a key and lets go of it, as the keyboard does: a real key event through the host, with modifiers when asked.
 *
 * @param key the key
 * @param modifiers the DevTools modifier bits (CTRL), none by default
 */
async function chord(key: string, modifiers = 0): Promise<void> {
  const [code, name] = CODES[key] as [number, string]
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: name, modifiers }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/**
 * Presses Ctrl and a key.
 *
 * @param key the key: `/` or `Enter`
 * @returns once the key is let go
 */
const ctrl = (key: string) => chord(key, CTRL)

/** A page expression: toasts at the bottom left, 16 px right of the rail, over neither the Write button nor the toolbar. */
const TOAST_AT_BOTTOM_LEFT = `(() => {
  const toast = document.querySelector('.kit-toast').getBoundingClientRect()
  const rail = document.querySelector('.rail').getBoundingClientRect()
  const apart = selector => {
    const box = document.querySelector(selector).getBoundingClientRect()

    return toast.right <= box.left || toast.left >= box.right || toast.bottom <= box.top || toast.top >= box.bottom
  }

  return Math.round(toast.left - rail.right) === 16 && toast.bottom < window.innerHeight
    && ['#write-staged', '#filter', '#metadata-button', '.param-name'].every(s => !document.querySelector(s) || apart(s))
})()`

/**
 * Where the focus is.
 *
 * @returns the id of the element that has it, else its tag
 */
const focused = () => app.evaluate<string>('document.activeElement?.id || document.activeElement?.tagName')

/**
 * The parameter that is selected.
 *
 * @returns its name
 */
const selected = () => app.evaluate<string>(`document.querySelector('#rows tr.selected')?.dataset.id ?? ''`)

/**
 * Presses a key and waits until the selection is the one expected.
 *
 * @param key the key
 * @param id the parameter that is to be selected
 */
async function selectsOn(key: string, id: string): Promise<void> {
  await chord(key)
  await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id === '${id}'`)
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
})

afterAll(async () => {
  await app?.close()
})

/**
 * Types a search the way the keyboard does: the field's `input` event.
 *
 * @param text what is searched for
 */
async function search(text: string): Promise<void> {
  await app.evaluate(`(() => {
    const field = document.querySelector('#filter')
    field.value = ${JSON.stringify(text)}
    field.dispatchEvent(new Event('input'))
  })()`)
}

/**
 * Waits two frames, so that a scroll and what follows it in the page are done.
 *
 * @returns once they have passed
 */
const settle = () => app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')

/**
 * Presses the left button of the mouse on an element where it is, and lets go. (The driver's `click` scrolls the element to the
 * middle first, which is what this test must not have done.)
 *
 * @param selector the element
 */
async function clickWhereItIs(selector: string): Promise<void> {
  const { x, y } = await app.evaluate<{ x: number, y: number }>(`(() => {
    const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  const at = { x, y, button: 'left', clickCount: 1 }
  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mousePressed', ...at })
  await app.devtools('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at })
}

/** A page expression: the id of the second row that is whole in the scroll box, below the header that stays at its top. */
const SECOND_WHOLE_ROW = `(() => {
  const box = document.querySelector('.param-scroll').getBoundingClientRect()
  const header = document.querySelector('.param-scroll thead').getBoundingClientRect().height
  const whole = [...document.querySelectorAll('#rows tr:not(.spacer)')].filter(row => {
    const at = row.getBoundingClientRect()
    return at.top >= box.top + header && at.bottom <= box.bottom
  })

  return whole[1].dataset.id
})()`

describe('a press of the mouse on the list', () => {
  it('selects the row that is pressed (not the first), and leaves the list where it was scrolled', async () => {
    // A short window, so that the dozen rows do not all fit: the list scrolls.
    await app.devtools('Emulation.setDeviceMetricsOverride', { width: 1440, height: 420, deviceScaleFactor: 1, mobile: false })
    await settle()
    await app.evaluate(`document.querySelector('.param-scroll').scrollTop = 150`)
    await settle()
    const id = await app.evaluate<string>(SECOND_WHOLE_ROW)
    const before = await app.evaluate<number>(`document.querySelector('.param-scroll').scrollTop`)
    expect(before).toBeGreaterThan(0)
    expect(await selected()).toBe('')

    await clickWhereItIs(`tr[data-id="${id}"]`)

    await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id === '${id}'`)
    await settle()
    expect(await app.evaluate<number>(`document.querySelector('.param-scroll').scrollTop`)).toBe(before)
    expect(await app.evaluate<string>(`document.getElementById('param-list').getAttribute('aria-activedescendant')`))
      .toBe(`param-row-${id}`)
    await app.devtools('Emulation.clearDeviceMetricsOverride', {})
    await settle()
  })
})

describe('the search', () => {
  it('goes to the search on Ctrl+/ from the navigation', async () => {
    expect(await focused()).not.toBe('filter')

    await ctrl('/')

    await app.waitFor(`document.activeElement?.id === 'filter'`)
    expect(await app.evaluate<string>(`document.querySelector('#filter').placeholder`)).toBe('Filter parameters (Ctrl+/)')
  })

  it('goes to the list on Enter in the search, selecting its first row when the selected one is not in the list', async () => {
    await search('batt')
    await app.waitForText('#list-status', '2 of 12 parameters')

    await app.press('Enter')

    await app.waitFor(`document.activeElement?.id === 'param-list'`)
    expect(await selected()).toBe('BATT_CAPACITY')
  })
})

describe('the list', () => {
  it('moves the selection with Up, Down, Page Down, Page Up, Home and End, and keeps it in view', async () => {
    await search('')
    await app.waitForText('#list-status', '12 parameters')
    await app.evaluate(`document.getElementById('param-list').focus()`)

    await selectsOn('ArrowDown', 'BATT_LOW_VOLT')
    await selectsOn('ArrowUp', 'BATT_CAPACITY')
    await selectsOn('End', 'WPNAV_SPEED')
    await selectsOn('Home', 'ARMING_CHECK')
    await chord('PageDown')
    await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id !== 'ARMING_CHECK'`)
    await chord('PageUp')
    await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id === 'ARMING_CHECK'`)
    expect(await app.evaluate<string>(`document.getElementById('param-list').getAttribute('aria-activedescendant')`))
      .toBe('param-row-ARMING_CHECK')
    expect(await app.evaluate<boolean>(`(() => {
      const row = document.querySelector('#rows tr.selected').getBoundingClientRect()
      const box = document.querySelector('.param-scroll').getBoundingClientRect()

      return row.top >= box.top && row.bottom <= box.bottom
    })()`)).toBe(true)
  })

  it('has one tab stop for the whole list: the rows are not in the tab order', async () => {
    expect(await app.evaluate<number>(`document.querySelectorAll('#rows [tabindex]:not([tabindex="-1"])').length`)).toBe(0)
    expect(await app.evaluate<string>(`document.getElementById('param-list').getAttribute('tabindex')`)).toBe('0')
  })
})

describe('the Value field', () => {
  it('takes the focus on Enter in the list, with its text selected', async () => {
    await app.press('Enter')

    await app.waitFor(`document.activeElement?.id === 'draft'`)
    expect(await app.evaluate<boolean>(`(() => {
      const f = document.activeElement
      return f.selectionStart === 0 && f.selectionEnd === f.value.length && f.value.length > 0
    })()`)).toBe(true)
  })

  it('goes back to the list on Escape', async () => {
    await app.press('Escape')

    await app.waitFor(`document.activeElement?.id === 'param-list'`)
  })

  it('only queues the value on Enter, and writes nothing', async () => {
    await app.press('Enter')
    await app.waitFor(`document.activeElement?.id === 'draft'`)
    await app.fill('#draft', '9')
    await app.press('Enter')

    await app.waitFor(`document.querySelector('#staged .staged-row[data-id="ARMING_CHECK"]') !== null`)
    expect(await app.evaluate<boolean>(`document.querySelector('#confirm') !== null`)).toBe(false)
  })
})

describe('the Write button\'s key', () => {
  it('asks the question of the Write button on Ctrl+Enter in the field, and writes nothing without the answer', async () => {
    await ctrl('Enter')

    await app.waitForText('#question', /Write 1 parameter to the vehicle\?\nARMING_CHECK \d+ → 9/u)
    await cancelConfirm(app)
    expect(await app.evaluate<number>(`document.querySelectorAll('#staged .staged-row').length`)).toBe(1)
  })

  it('does the same on Ctrl+Enter in the list, and a toast says it when all was written and read back', async () => {
    await app.evaluate(`document.getElementById('param-list').focus()`)

    await ctrl('Enter')
    await app.waitForText('#question', /Write 1 parameter to the vehicle\?/u)
    await confirmWrite(app)

    await app.waitFor(`document.querySelector('.kit-toast.sev-success')?.textContent.includes('All 1 written and read back.')`)
    await app.waitFor(`document.querySelector('#staged .staged-row') === null`)
    expect(await app.evaluate<boolean>(TOAST_AT_BOTTOM_LEFT)).toBe(true)
  })

  it('does nothing on Ctrl+Enter with nothing queued', async () => {
    await ctrl('Enter')
    await sleep(700)

    expect(await app.evaluate<boolean>(`document.querySelector('#confirm') !== null`)).toBe(false)
  })
})

describe('the groups', () => {
  it('select the first parameter of the group that is chosen, and do not take the focus', async () => {
    await app.click('button[data-group="BATT"]')

    await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id === 'BATT_CAPACITY'`)
    expect(await app.evaluate<string>(`document.activeElement?.dataset.group ?? ''`)).toBe('BATT')

    await app.click('button[data-group=""]')
    await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id === 'ARMING_CHECK'`)
  })

  it('give the focus to the list on Escape', async () => {
    await app.evaluate(`document.querySelector('button[data-group="BATT"]').focus()`)

    await app.press('Escape')

    await app.waitFor(`document.activeElement?.id === 'param-list'`)
  })
})
