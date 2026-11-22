// The context menu: it opens at the pointer on a right click and at the focused element on the Menu key or Shift F10, the keys
// move between the items and skip the ones that cannot be chosen, Enter chooses, Escape and Tab and a press elsewhere close, and
// the focus goes back to where it was.
import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { h } from 'vue'
import type { MenuItem } from '@/lib/ui/menuKeys'
import ContextMenu from './ContextMenu.vue'

const ITEMS: MenuItem[] = [
  { id: 'fly', label: 'Fly here' },
  { id: 'home', label: 'Set home', disabled: true },
  { id: 'copy', label: 'Copy', hint: 'Ctrl C' },
  { id: 'delete', label: 'Delete the item', danger: true },
]

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * A menu for a focusable area.
 *
 * @param items the items
 * @returns the wrapper
 */
function menu(items: MenuItem[] = ITEMS): VueWrapper {
  mounted = mount(ContextMenu, {
    props: { label: 'Item actions', items },
    slots: { default: () => h('div', { id: 'area', tabindex: 0 }, 'area') },
    attachTo: document.body,
  })

  return mounted
}

/**
 * A right click at a point on the area.
 *
 * @param wrapper the menu
 * @param x where
 * @param y where
 * @returns the event, to see whether it was cancelled
 */
async function rightClick(wrapper: VueWrapper, x = 120, y = 80): Promise<MouseEvent> {
  const event = new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true })

  wrapper.get('#area').element.dispatchEvent(event)
  await flushPromises()

  return event
}

/**
 * Presses a key where the focus is.
 *
 * @param key the key
 * @param more what else is down
 * @returns the event
 */
async function press(key: string, more: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...more })

  document.activeElement?.dispatchEvent(event)
  await flushPromises()

  return event
}

/**
 * The text of the item that has the focus.
 *
 * @returns the label, or an empty text
 */
function focused(): string {
  return document.activeElement?.textContent?.trim() ?? ''
}

describe('a right click', () => {
  it('opens the menu at the pointer, with its items, and the focus on the first one that can be chosen', async () => {
    const wrapper = menu()
    const event = await rightClick(wrapper, 120, 80)
    const list = wrapper.get('[role="menu"]')

    expect(event.defaultPrevented).toBe(true)
    expect(list.attributes('aria-label')).toBe('Item actions')
    expect(list.attributes('style')).toContain('left: 120px')
    const labels = wrapper.findAll('[role="menuitem"]').map(item => item.text())

    expect(labels).toEqual(['Fly here', 'Set home', 'CopyCtrl C', 'Delete the item'])
    expect(wrapper.get('.hint').text()).toBe('Ctrl C')
    expect(wrapper.get('.danger').text()).toBe('Delete the item')
    expect(focused()).toBe('Fly here')
  })

  it('opens nothing, and leaves the system\'s own menu alone, when there are no items', async () => {
    const wrapper = menu([])
    const event = await rightClick(wrapper)

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})

describe('the keys of the system', () => {
  it('open the menu at the element that has the focus: the Menu key, and Shift F10', async () => {
    const wrapper = menu();
    (wrapper.get('#area').element as HTMLElement).focus()
    const first = await press('ContextMenu')

    expect([first.defaultPrevented, wrapper.find('[role="menu"]').exists()]).toEqual([true, true])
    await press('Escape')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await press('F10', { shiftKey: true })
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  })

  it('are not the menu\'s when F10 is pressed without Shift', async () => {
    const wrapper = menu();
    (wrapper.get('#area').element as HTMLElement).focus()
    await press('F10')

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})

describe('the keys in the menu', () => {
  it('move between the items, skip the one that cannot be chosen, and wrap round', async () => {
    const wrapper = menu()

    await rightClick(wrapper)
    await press('ArrowDown')
    expect(focused()).toBe('CopyCtrl C')
    await press('ArrowDown')
    await press('ArrowDown')
    expect(focused()).toBe('Fly here')
    await press('ArrowUp')
    expect(focused()).toBe('Delete the item')
  })

  it('go to the ends with Home and End, and to an item by its first letter', async () => {
    const wrapper = menu()

    await rightClick(wrapper)
    await press('End')
    expect(focused()).toBe('Delete the item')
    await press('Home')
    expect(focused()).toBe('Fly here')
    await press('c')
    expect(focused()).toBe('CopyCtrl C')
  })
})

describe('choosing', () => {
  it('says the item that was chosen, closes the menu and puts the focus back where it was', async () => {
    const wrapper = menu();
    (wrapper.get('#area').element as HTMLElement).focus()
    await rightClick(wrapper)
    await press('ArrowDown')
    await wrapper.get('[role="menuitem"]:focus').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['copy']])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('#area').element)
  })

  it('cannot choose an item that is disabled', async () => {
    const wrapper = menu()

    await rightClick(wrapper)
    const [, item] = wrapper.findAll('[role="menuitem"]')

    expect(item?.attributes('disabled')).toBeDefined()
    await item?.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})

describe('closing', () => {
  it('with Escape puts the focus back, and the Escape goes no further (a dialog stays open)', async () => {
    const wrapper = menu()
    let outer = 0
    const count = (): void => {
      outer += 1
    }

    document.body.addEventListener('keydown', count);
    (wrapper.get('#area').element as HTMLElement).focus()
    await rightClick(wrapper)
    const event = await press('Escape')

    document.body.removeEventListener('keydown', count)
    expect([event.defaultPrevented, outer, wrapper.find('[role="menu"]').exists()]).toEqual([true, 0, false])
    expect(document.activeElement).toBe(wrapper.get('#area').element)
  })
})

describe('closing, by Tab or elsewhere', () => {
  it('with Tab, or a press elsewhere, closes it and leaves the focus where it goes', async () => {
    const wrapper = menu()

    await rightClick(wrapper)
    await press('Tab')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    await rightClick(wrapper)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('does not happen on a press inside the menu, nor does a right click in it open another', async () => {
    const wrapper = menu()

    await rightClick(wrapper)
    const item = wrapper.get('[role="menuitem"]').element

    item.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    const again = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })

    item.dispatchEvent(again)
    await flushPromises()

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(again.defaultPrevented).toBe(false)
  })
})
