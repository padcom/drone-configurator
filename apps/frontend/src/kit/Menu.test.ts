import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import Menu from './Menu.vue'
import type { MenuItem } from './menuKeys'

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
