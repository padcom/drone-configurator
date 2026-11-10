// The keyboard of the Parameters screen: the list (one tab stop, a selected row that the keys move), the search, the Value field,
// the groups. (The shortcuts that work from more than one place are in paramShortcuts.test.ts.)
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { PARAMS, VEHICLE } from './fixtures'
import { mockBackend } from './mock-backend'
import ParamEditor from './ParamEditor.vue'
import ParamFilter from './ParamFilter.vue'
import ParamGroups from './ParamGroups.vue'
import ParamTable from './ParamTable.vue'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

const mounted: VueWrapper[] = []

afterEach(() => {
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount()
  }
  useParamGroup().choose('')
})

/**
 * Mounts a component on the page (the focus needs it there).
 *
 * @param component the component
 * @returns the wrapper
 */
function onPage(component: Parameters<typeof mount>[0]): VueWrapper {
  const wrapper = mount(component, { ...withI18n, attachTo: document.body })
  mounted.push(wrapper)

  return wrapper
}

/**
 * The list on a fresh Configurator that holds the fixture parameters, with a box of five rows' height.
 *
 * @returns the wrapper and the Configurator
 */
function list() {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'complete' })
  const wrapper = onPage(ParamTable)
  Object.defineProperty(wrapper.get('.param-scroll').element, 'clientHeight', { configurable: true, value: 5 * 44 })

  return { wrapper, handle }
}

/**
 * Presses a key on the list.
 *
 * @param wrapper the mounted table
 * @param key the key
 */
async function press(wrapper: VueWrapper, key: string): Promise<void> {
  await wrapper.get('#param-list').trigger('keydown', { key })
}

it('has a list that is one tab stop, a grid that points to its selected row', async () => {
  const { wrapper, handle } = list()
  const table = wrapper.get('#param-list')

  expect(table.attributes('tabindex')).toBe('0')
  expect(table.attributes('role')).toBe('grid')
  expect(wrapper.findAll('#rows tr[tabindex]')).toHaveLength(0)

  handle.parameters.select('RTL_ALT')
  await wrapper.vm.$nextTick()

  expect(table.attributes('aria-activedescendant')).toBe('param-row-RTL_ALT')
  expect(wrapper.get('#param-row-RTL_ALT').attributes('aria-selected')).toBe('true')
  expect(wrapper.get('#param-row-BATT_CAPACITY').attributes('aria-selected')).toBe('false')
})

it('selects the first row when the list takes the focus with nothing selected, and keeps a selection it has', async () => {
  const { wrapper, handle } = list()

  await wrapper.get('#param-list').trigger('focus')
  expect(handle.fields.selected.value).toBe('ARMING_CHECK')

  handle.parameters.select('RTL_ALT')
  await wrapper.get('#param-list').trigger('focus')
  expect(handle.fields.selected.value).toBe('RTL_ALT')
})

it('does not select the first row or move the list when the mouse brings the focus; the row pressed is selected', async () => {
  const { wrapper, handle } = list()
  const box = wrapper.get('.param-scroll').element
  box.scrollTop = 100

  await wrapper.get('#param-list').trigger('mousedown')
  await wrapper.get('#param-list').trigger('focus')
  await wrapper.get('tr[data-id="BATT_LOW_VOLT"]').trigger('click')
  await flushPromises()
  window.dispatchEvent(new MouseEvent('mouseup'))

  // The row is cut by the top of the box (88 to 132, the box is scrolled to 100): the click does not nudge it into view.
  expect(handle.fields.selected.value).toBe('BATT_LOW_VOLT')
  expect(box.scrollTop).toBe(100)
  // The next focus is a keyboard's again.
  handle.parameters.select('')
  await wrapper.get('#param-list').trigger('focus')
  expect(handle.fields.selected.value).toBe('ARMING_CHECK')
})

it('ignores repeats of Enter in the list, and composition and repeats of Enter in the search', async () => {
  const { wrapper, handle } = list()
  handle.parameters.select('RTL_ALT')
  const field = document.body.appendChild(document.createElement('input'))
  field.id = 'draft'
  const search = onPage(ParamFilter).get('#filter')

  await wrapper.get('#param-list').trigger('keydown', { key: 'Enter', repeat: true })
  expect(document.activeElement).not.toBe(field)
  await search.trigger('keydown', { key: 'Enter', isComposing: true })
  await search.trigger('keydown', { key: 'Enter', repeat: true })
  expect(document.activeElement?.id).not.toBe('param-list')

  await search.trigger('keydown', { key: 'Enter' })
  expect(document.activeElement?.id).toBe('param-list')
  field.remove()
})

it('moves the selection with Up and Down by a row, Page Up and Page Down by a page, Home and End to the ends', async () => {
  const { wrapper, handle } = list()
  handle.parameters.select('BATT_CAPACITY')
  const selected = () => handle.fields.selected.value
  const after = async (...keys: string[]) => {
    await keys.reduce((done, key) => done.then(() => press(wrapper, key)), Promise.resolve())

    return selected()
  }

  expect(await after('ArrowDown')).toBe('BATT_LOW_VOLT')
  expect(await after('ArrowUp', 'ArrowUp', 'ArrowUp')).toBe('ARMING_CHECK')
  expect(await after('PageDown')).toBe('FS_THR_ENABLE')
  expect(await after('End', 'ArrowDown')).toBe('WPNAV_SPEED')
  expect(await after('PageUp')).toBe('LOIT_SPEED')
  expect(await after('Home')).toBe('ARMING_CHECK')
})

it('takes no key with Ctrl, Alt or Meta, and leaves other keys to the browser', async () => {
  const { wrapper, handle } = list()
  handle.parameters.select('BATT_CAPACITY')

  await wrapper.get('#param-list').trigger('keydown', { key: 'ArrowDown', ctrlKey: true })
  await wrapper.get('#param-list').trigger('keydown', { key: 'a' })

  expect(handle.fields.selected.value).toBe('BATT_CAPACITY')
})

it('goes from the list to the Value field on Enter, with its text selected', async () => {
  const { wrapper, handle } = list()
  handle.parameters.select('RTL_ALT')
  const field = document.body.appendChild(document.createElement('input'))
  field.id = 'draft'
  const select = vi.spyOn(field, 'select')

  await press(wrapper, 'Enter')

  expect(document.activeElement).toBe(field)
  expect(select).toHaveBeenCalled()
  field.remove()
})

it('scrolls the selected row into view, also when something else than the list selected it (Related, the changes)', async () => {
  const { wrapper, handle } = list()
  const box = wrapper.get('.param-scroll').element

  handle.parameters.select('WPNAV_SPEED')
  await flushPromises()

  // The last of 12 rows of 44 px, in a box that shows five rows.
  expect(box.scrollTop).toBe(12 * 44 - 5 * 44)
  handle.parameters.select('ARMING_CHECK')
  await flushPromises()
  expect(box.scrollTop).toBe(0)
})

it('selects the first parameter of a group that is chosen, and of All, and does not take the focus', async () => {
  const { wrapper, handle } = list()
  const groups = onPage(ParamGroups)
  const focusBefore = document.activeElement
  handle.parameters.select('WPNAV_SPEED')

  await groups.get('button[data-group="BATT"]').trigger('click')
  await flushPromises()
  expect(handle.fields.selected.value).toBe('BATT_CAPACITY')
  expect(wrapper.get('tr.selected').attributes('data-id')).toBe('BATT_CAPACITY')
  expect(document.activeElement).toBe(focusBefore)

  await groups.get('button[data-group=""]').trigger('click')
  await flushPromises()
  expect(handle.fields.selected.value).toBe('ARMING_CHECK')
  expect(groups.findAll('button').filter(button => button.attributes('tabindex') === '0')).toHaveLength(1)
})

it('gives the focus to the list on Escape in the groups, unless something else took the key', async () => {
  list()
  const groups = onPage(ParamGroups)
  const button = groups.get('button[data-group="BATT"]')

  button.element.addEventListener('keydown', event => event.preventDefault(), { once: true })
  await button.trigger('keydown', { key: 'Escape' })
  expect(document.activeElement?.id).not.toBe('param-list')

  await button.trigger('keydown', { key: 'Escape' })
  expect(document.activeElement?.id).toBe('param-list')
})

it('hints the shortcut of the search, and gives the focus to the list on Enter in it', async () => {
  list()
  const input = onPage(ParamFilter).get('#filter')

  expect(input.attributes('placeholder')).toBe('Filter parameters (Ctrl+/)')
  expect(input.attributes('aria-keyshortcuts')).toBe('Control+/')
  await input.trigger('keydown', { key: 'Enter' })

  expect(document.activeElement?.id).toBe('param-list')
})

it('moves the selected row from the search with Up, Down, Page Up and Page Down; the focus stays in it', async () => {
  const { wrapper, handle } = list()
  const search = onPage(ParamFilter).get('#filter');
  (search.element as HTMLInputElement).focus()
  const selected = () => handle.fields.selected.value
  const inSearch = async (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    search.element.dispatchEvent(event)
    await flushPromises()

    return event.defaultPrevented
  }

  expect(await inSearch('ArrowDown')).toBe(true)
  expect(selected()).toBe('ARMING_CHECK')
  expect(await inSearch('ArrowDown')).toBe(true)
  expect(selected()).toBe('BATT_CAPACITY')
  // A page is five rows in the box of this test.
  expect(await inSearch('PageDown')).toBe(true)
  expect(selected()).toBe('LOIT_SPEED')
  expect(await inSearch('ArrowUp')).toBe(true)
  expect(await inSearch('PageUp')).toBe(true)
  expect(selected()).toBe('ARMING_CHECK')
  expect(document.activeElement).toBe(search.element)
  // The selected row is shown, and Home and End are left to the caret.
  expect(wrapper.get('tr.selected').attributes('data-id')).toBe('ARMING_CHECK')
  expect(await inSearch('Home')).toBe(false)
  expect(await inSearch('End')).toBe(false)
})

it('says politely which parameter the selection is on, and where in the list, when it moves', async () => {
  const { wrapper, handle } = list()
  const status = wrapper.get('#selection-status')

  expect(status.attributes('role')).toBe('status')
  expect(status.text()).toBe('')
  handle.parameters.select('BATT_LOW_VOLT')
  await wrapper.vm.$nextTick()

  expect(status.text()).toBe('BATT_LOW_VOLT, 3 of 12')
  // Typing in the search changes the list and not the selected parameter: the region says nothing new (it would speak with
  // every key), and says the new place when the selected parameter changes.
  feed(handle, { filter: 'batt' })
  await wrapper.vm.$nextTick()
  expect(status.text()).toBe('BATT_LOW_VOLT, 3 of 12')
  handle.parameters.select('BATT_CAPACITY')
  await wrapper.vm.$nextTick()
  expect(status.text()).toBe('BATT_CAPACITY, 1 of 2')
})

it('leaves the keys of the search alone with a modifier, in an input method\'s composition, and with no rows', () => {
  const { handle } = list()
  const search = onPage(ParamFilter).get('#filter')
  const taken = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, ...init })
    search.element.dispatchEvent(event)

    return event.defaultPrevented
  }

  expect([taken({ shiftKey: true }), taken({ ctrlKey: true }), taken({ isComposing: true })]).toEqual([false, false, false])
  expect(handle.fields.selected.value).toBeNull()

  feed(handle, { filter: 'zzz' })
  expect(taken({})).toBe(false)
})

/**
 * The editor with a vehicle connected and RTL_ALT selected, and the list beside it.
 *
 * @returns the editor and the Configurator
 */
async function editor() {
  const { handle } = list()
  const field = onPage(ParamEditor)
  await flushPromises()
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  handle.parameters.select('RTL_ALT')
  await field.vm.$nextTick()

  return { field, handle }
}

it('gives the focus back to the list on Escape in the Value field', async () => {
  const { field } = await editor()
  const input = field.get<HTMLInputElement>('#draft')
  input.element.focus()

  await input.trigger('keydown', { key: 'Escape' })

  expect(document.activeElement?.id).toBe('param-list')
})

it('leaves an Escape that the open list of names took, to close that list first', async () => {
  const { field, handle } = await editor()
  const values = { 0: 'Off', 1500: 'On' }
  const file = { format: 'drone-configurator/param-metadata', version: 1, params: { RTL_ALT: { values } } }
  handle.metadata.load(JSON.stringify(file))
  await flushPromises()
  const combo = field.get<HTMLInputElement>('#draft')
  await combo.trigger('focus')
  expect(combo.attributes('aria-expanded')).toBe('true')

  await combo.trigger('keydown', { key: 'Escape' })
  expect(combo.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement?.id).not.toBe('param-list')

  await combo.trigger('keydown', { key: 'Escape' })
  expect(document.activeElement?.id).toBe('param-list')
})
