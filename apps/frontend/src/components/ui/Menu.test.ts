import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Menu from './Menu.vue'
import type { MenuItem } from '@/lib/ui/menuKeys'

const ITEMS: MenuItem[] = [
  { id: 'fly', label: 'Fly here' },
  { id: 'home', label: 'Set home here', disabled: true },
  { id: 'look', label: 'Look at this point' },
  { id: 'copy', label: 'Copy coordinates', hint: 'Ctrl C' },
]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/**
 * A menu in the page.
 *
 * @returns the wrapper
 */
function menu(): VueWrapper {
  return mount(Menu, { props: { label: 'Map', items: ITEMS }, attachTo: document.body })
}

/**
 * The id of the element that has the focus.
 *
 * @returns the text of the focused menu item, or an empty string
 */
const focused = () => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? ''

/**
 * Opens the menu with a click on its button.
 *
 * @param wrapper the menu
 */
async function open(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('button').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('a menu at rest', () => {
  it('is a button that says it opens a menu, and has no list', () => {
    const wrapper = menu()
    const button = wrapper.get('button')

    expect(button.attributes('aria-haspopup')).toBe('menu')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})

describe('an open menu', () => {
  it('has the items with their key hints, and the first that can be chosen focused', async () => {
    const wrapper = menu()

    await open(wrapper)
    const texts = wrapper.findAll('[role="menuitem"]').map(i => i.text())

    expect(texts).toEqual(['Fly here', 'Set home here', 'Look at this point', 'Copy coordinatesCtrl C'])
    expect(focused()).toBe('Fly here')
  })

  it('says it is open on its button, and names the list by the button', async () => {
    const wrapper = menu()

    await open(wrapper)

    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="menu"]').attributes('aria-labelledby')).toBe(wrapper.get('button').attributes('id'))
  })
})

describe('choosing in a menu', () => {
  it('has a disabled item that cannot be chosen', async () => {
    const wrapper = menu()
    await open(wrapper)

    await wrapper.findAll('[role="menuitem"]')[1]?.trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('says which item was chosen, closes, and puts the focus back on the button', async () => {
    const wrapper = menu()
    await open(wrapper)

    await wrapper.findAll('[role="menuitem"]')[2]?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['look']])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button').element)
  })
})

describe('the keys of a menu, by page', () => {
  it('move by a page with Page Down and Page Up, stopping at the ends and skipping a disabled item', async () => {
    const wrapper = menu()
    await open(wrapper)
    const list = wrapper.get('[role="menu"]')

    await list.trigger('keydown', { key: 'PageDown' })
    expect(focused()).toBe('Copy coordinatesCtrl C')
    await list.trigger('keydown', { key: 'PageUp' })
    expect(focused()).toBe('Fly here')
  })
})

describe('the keys of a menu', () => {
  it('move with the arrows (skipping a disabled item and wrapping) and with Home and End', async () => {
    const wrapper = menu()
    await open(wrapper)
    const list = wrapper.get('[role="menu"]')

    await list.trigger('keydown', { key: 'ArrowDown' })
    expect(focused()).toBe('Look at this point')
    await list.trigger('keydown', { key: 'End' })
    expect(focused()).toBe('Copy coordinatesCtrl C')
    await list.trigger('keydown', { key: 'ArrowDown' })
    expect(focused()).toBe('Fly here')
    await list.trigger('keydown', { key: 'ArrowUp' })
    expect(focused()).toBe('Copy coordinatesCtrl C')
    await list.trigger('keydown', { key: 'Home' })

    expect(focused()).toBe('Fly here')
  })
})

describe('type-ahead in a menu', () => {
  it('goes to the item that starts with the letter typed', async () => {
    const wrapper = menu()
    await open(wrapper)
    const list = wrapper.get('[role="menu"]')

    await list.trigger('keydown', { key: 'c' })

    expect(focused()).toBe('Copy coordinatesCtrl C')
  })

  it('remembers the letters typed in a short while, and forgets them after', async () => {
    const wrapper = menu()
    await open(wrapper)
    const list = wrapper.get('[role="menu"]')

    await list.trigger('keydown', { key: 'l' })
    vi.advanceTimersByTime(1000)
    await list.trigger('keydown', { key: 'c' })

    expect(focused()).toBe('Copy coordinatesCtrl C')
  })
})

describe('closing a menu', () => {
  it('with Escape, which puts the focus back on the button and stays with the menu (not a dialog)', async () => {
    const wrapper = menu()
    await open(wrapper)
    const outside = vi.fn()
    document.body.addEventListener('keydown', outside)

    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button').element)
    expect(outside).not.toHaveBeenCalled()
    document.body.removeEventListener('keydown', outside)
  })
})

describe('closing a menu, elsewhere', () => {
  it('with Tab, and with a press outside, but not with a press inside', async () => {
    const wrapper = menu()
    await open(wrapper)
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Tab' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await open(wrapper)
    wrapper.get('[role="menu"]').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('opens on the first or the last item with the arrows on the button', async () => {
    const wrapper = menu()
    await wrapper.get('button').trigger('keydown', { key: 'ArrowUp' })
    await wrapper.vm.$nextTick()

    expect(focused()).toBe('Copy coordinatesCtrl C')
  })
})

/**
 * A key event.
 *
 * @param key the key
 * @param repeat whether it is the repeat of a held key
 * @returns the event
 */
const press = (key: string, repeat: boolean) => new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true })

describe('a key that is held down, on the button', () => {
  it('does not open the menu: the repeat of Enter or Space is cancelled, and a click it would make is ignored', async () => {
    const wrapper = menu()
    const button = wrapper.get('button')
    const events = ['Enter', ' '].map(key => press(key, true))

    events.forEach(event => button.element.dispatchEvent(event))
    await button.trigger('click')

    expect(events.map(event => event.defaultPrevented)).toEqual([true, true])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('does not cancel a first press', () => {
    const wrapper = menu()
    const event = press('Enter', false)
    wrapper.get('button').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe('a key that is held down, on an item', () => {
  it('does not choose it: the repeat is cancelled and a click it would make chooses nothing', async () => {
    const wrapper = menu()
    await open(wrapper)
    const [first] = wrapper.findAll('[role="menuitem"]')
    const repeat = press('Enter', true)
    first?.element.dispatchEvent(repeat)
    await first?.trigger('click')

    expect(repeat.defaultPrevented).toBe(true)
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  })

  it('chooses it again once the key was released', async () => {
    const wrapper = menu()
    await open(wrapper)
    const [first] = wrapper.findAll('[role="menuitem"]')
    first?.element.dispatchEvent(press('Enter', true))

    await first?.trigger('keyup', { key: 'Enter' })
    await first?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['fly']])
  })
})

/**
 * A click as a mouse makes it (a click that a key makes has a detail of 0).
 *
 * @param wrapper what is clicked
 * @param wrapper.element its element
 */
async function mouseClick(wrapper: { element: Element }): Promise<void> {
  wrapper.element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }))
  await nextTick()
}

describe('a key that is held down and released elsewhere', () => {
  it('never keeps a pointer click from opening the menu and choosing an item', async () => {
    const wrapper = menu()
    await open(wrapper)
    const [first] = wrapper.findAll('[role="menuitem"]')
    first?.element.dispatchEvent(press('Enter', true))
    await mouseClick(wrapper.get('button'))
    await mouseClick(wrapper.get('button'))
    const shown = wrapper.find('[role="menu"]').exists()
    await mouseClick(wrapper.findAll('[role="menuitem"]')[0]!)

    expect(shown).toBe(true)

    expect(wrapper.emitted('select')).toEqual([['fly']])
  })

  it('forgets the held key when the focus leaves, and when a pointer goes down', async () => {
    const wrapper = menu()
    const button = wrapper.get('button')
    button.element.dispatchEvent(press('Enter', true))
    await wrapper.trigger('focusout')
    await button.trigger('click')

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)

    wrapper.get('button').element.dispatchEvent(press('Enter', true))
    await wrapper.trigger('pointerdown')
    await open(wrapper)

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})
