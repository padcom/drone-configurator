// The field of bits: a number that is typed, with a list of boxes that toggle the bits. It tells the screen what the draft is
// (`edit`) and when it is settled (`settle`); the tests hold the draft the way the screen does.
import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import BitField from './BitField.vue'
import { bitOptions } from './bitmask'
import { withI18n } from './testing'

const NAMES = { 0: 'All', 1: 'Barometer', 2: 'Compass', 3: 'GPS lock', 4: 'INS', 5: 'Parameters' }

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * A field whose draft follows its edits, as the screen's does.
 *
 * @param draft the number in the field
 * @param type the parameter's type
 * @param names the names of the bits
 * @returns the wrapper
 */
function field(draft: string, type = 'INT32', names: Record<string, string> = NAMES): VueWrapper {
  mounted?.unmount()
  mounted = mount(BitField, {
    ...withI18n,
    props: {
      options: bitOptions(names, type),
      type,
      draft,
      value: Number(draft),
      label: 'Value',
      onEdit: (text: string) => mounted?.setProps({ draft: text, value: Number(text) }),
    },
    attachTo: document.body,
  })

  return mounted
}

const rows = (wrapper: VueWrapper) => wrapper.findAll('[role="option"]')
const open = (wrapper: VueWrapper) => wrapper.get('input').trigger('focus')
const press = (wrapper: VueWrapper, key: string) => wrapper.get('input').trigger('keydown', { key })
const activeId = (wrapper: VueWrapper) => wrapper.get('input').attributes('aria-activedescendant')
const where = (wrapper: VueWrapper) => rows(wrapper).findIndex(row => row.attributes('id') === activeId(wrapper))
const edits = (wrapper: VueWrapper) => (wrapper.emitted('edit') ?? []).map(args => args[0])
const settles = (wrapper: VueWrapper) => (wrapper.emitted('settle') ?? []).length
const click = (wrapper: VueWrapper, row: number) => rows(wrapper)[row]!.trigger('click')
const selected = (wrapper: VueWrapper) => rows(wrapper).map(row => row.attributes('aria-selected') === 'true')
const summary = (wrapper: VueWrapper) => wrapper.get('.bit-summary').text()
const isOpen = (wrapper: VueWrapper) => wrapper.find('[role="listbox"]').exists()

describe('the field at rest', () => {
  it('shows the number and what it has set, and is a combobox over a multiselectable list', async () => {
    const wrapper = field('14')
    const input = wrapper.get<HTMLInputElement>('input')

    expect(input.element.value).toBe('14')
    expect(summary(wrapper)).toBe('3 bits: Barometer, Compass, GPS lock')
    expect([input.attributes('role'), input.attributes('aria-haspopup'), input.attributes('aria-expanded')])
      .toEqual(['combobox', 'listbox', 'false'])
    await open(wrapper)
    expect(wrapper.get('[role="listbox"]').attributes('aria-multiselectable')).toBe('true')
    expect(input.attributes('aria-controls')).toBe(wrapper.get('[role="listbox"]').attributes('id'))
  })

  it('says 1 bit for one, nothing for none, and cuts a long list of names', () => {
    expect(summary(field('2'))).toBe('1 bit: Barometer')
    expect(summary(field('0'))).toBe('')
    expect(summary(field('31'))).toBe('5 bits: All, Barometer, Compass, …')
  })

  it('shows the bits that have no name as "other bits", in hexadecimal', () => {
    expect(summary(field('1025'))).toBe('1 bit: All; other bits: 0x400')
  })
})

describe('the list', () => {
  it('has a row for every named bit, lowest first, with its box, name and bit number', async () => {
    const wrapper = field('5')
    await open(wrapper)

    expect(rows(wrapper).map(row => row.text())).toEqual([
      'Allbit 0', 'Barometerbit 1', 'Compassbit 2', 'GPS lockbit 3', 'INSbit 4', 'Parametersbit 5',
    ])
    expect(selected(wrapper)).toEqual([true, false, true, false, false, false])
    expect(rows(wrapper).map(row => row.find('.box svg').exists())).toEqual(selected(wrapper))
  })

  it('opens on a click as well as on the focus, and lists the bits it does not name under the rows', async () => {
    const wrapper = field('64')
    expect(isOpen(wrapper)).toBe(false)

    await wrapper.get('input').trigger('click')

    expect(wrapper.get('.bit-other').text()).toBe('other bits: 0x40')
  })
})

describe('a toggle', () => {
  it('is a click on a row, live, and neither settles nor closes', async () => {
    const wrapper = field('0')
    await open(wrapper)

    await click(wrapper, 3)
    await click(wrapper, 0)
    expect(edits(wrapper)).toEqual(['8', '9'])
    await click(wrapper, 3)

    expect(edits(wrapper)).toEqual(['8', '9', '1'])
    expect(settles(wrapper)).toBe(0)
    expect(isOpen(wrapper)).toBe(true)
  })

  it('says what a toggle did, politely', async () => {
    const wrapper = field('0')
    await open(wrapper)

    await click(wrapper, 3)
    expect(wrapper.get('[role="status"]').text()).toBe('GPS lock on')
    await click(wrapper, 3)
    expect(wrapper.get('[role="status"]').text()).toBe('GPS lock off')
  })
})

describe('the arrows', () => {
  it('open the list and move the highlight one row with the arrows, and stay inside the list', async () => {
    const wrapper = field('0')

    await press(wrapper, 'ArrowDown')
    expect(where(wrapper)).toBe(0)
    await press(wrapper, 'ArrowDown')
    expect(where(wrapper)).toBe(1)
    await press(wrapper, 'ArrowUp')
    await press(wrapper, 'ArrowUp')
    expect(where(wrapper)).toBe(0)
    expect(rows(wrapper)[0]!.classes()).toContain('active')
  })
})

describe('the other keys that move', () => {
  it('go to the first and the last row with Home and End, and by a page with Page Down and Page Up', async () => {
    const wrapper = field('0')

    await press(wrapper, 'End')
    expect(where(wrapper)).toBe(5)
    await press(wrapper, 'ArrowDown')
    expect(where(wrapper)).toBe(5)
    await press(wrapper, 'Home')
    expect(where(wrapper)).toBe(0)
    await press(wrapper, 'PageDown')
    expect(where(wrapper)).toBe(5)
    await press(wrapper, 'PageUp')
    expect(where(wrapper)).toBe(0)
  })
})

describe('the highlighted row', () => {
  it('is scrolled into view', async () => {
    const wrapper = field('0')
    const scrolled: (string | null)[] = []
    Element.prototype.scrollIntoView = function scrollIntoView() {
      scrolled.push(this.getAttribute('id'))
    }

    await press(wrapper, 'End')
    await wrapper.vm.$nextTick()

    expect(scrolled).toContain(rows(wrapper)[5]!.attributes('id'))
  })
})

describe('Space and Enter', () => {
  it('toggle the highlighted row with Space, and with no row highlighted do nothing', async () => {
    const wrapper = field('0')
    await press(wrapper, ' ')
    expect(edits(wrapper)).toEqual([])

    await press(wrapper, 'ArrowDown')
    await press(wrapper, 'ArrowDown')
    await press(wrapper, ' ')
    await press(wrapper, ' ')

    expect(edits(wrapper)).toEqual(['2', '0'])
    expect(settles(wrapper)).toBe(0)
  })

  it('settle and close with Enter', async () => {
    const wrapper = field('0')
    await press(wrapper, 'ArrowDown')
    await press(wrapper, ' ')

    await press(wrapper, 'Enter')

    expect(settles(wrapper)).toBe(1)
    expect(isOpen(wrapper)).toBe(false)
  })
})

describe('Ctrl+Enter and Escape', () => {
  it('only close with Ctrl+Enter, which the screen\'s shortcut settles and goes on to Write from', async () => {
    const wrapper = field('0')
    await press(wrapper, 'ArrowDown')
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })

    wrapper.get('input').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(isOpen(wrapper)).toBe(false)
    expect(settles(wrapper)).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('close the list with Escape and keep the value, then let the key go on once it is closed', async () => {
    const wrapper = field('0')
    await press(wrapper, 'ArrowDown')
    await press(wrapper, ' ')
    const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.get('input').element.dispatchEvent(first)
    await wrapper.vm.$nextTick()

    expect(first.defaultPrevented).toBe(true)
    expect(isOpen(wrapper)).toBe(false)
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('1')
    expect(settles(wrapper)).toBe(0)

    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.get('input').element.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(false)
  })
})

describe('the number', () => {
  it('is typed, and the boxes follow it', async () => {
    const wrapper = field('0')
    await open(wrapper)

    await wrapper.get('input').setValue('6')

    expect(edits(wrapper)).toEqual(['6'])
    expect(selected(wrapper)).toEqual([false, true, true, false, false, false])
    expect(settles(wrapper)).toBe(0)
  })

  it('is settled when the field is left, and the list closes', async () => {
    const wrapper = field('0')
    await open(wrapper)

    await wrapper.get('input').trigger('blur')

    expect(settles(wrapper)).toBe(1)
    expect(isOpen(wrapper)).toBe(false)
  })
})

describe('the bits that have no name', () => {
  it('stay when a named one is toggled, and are shown as they are', async () => {
    const wrapper = field('1025')
    await open(wrapper)

    await click(wrapper, 0)
    expect(edits(wrapper)).toEqual(['1024'])
    expect(summary(wrapper)).toBe('other bits: 0x400')
    await click(wrapper, 0)

    expect(edits(wrapper)[1]).toBe('1025')
    expect(summary(wrapper)).toBe('1 bit: All; other bits: 0x400')
  })
})

describe('the high bits', () => {
  const TOP = { 31: 'Top', 0: 'Low' }

  it('toggle bit 31 of a UINT32 as a large positive number', async () => {
    const wrapper = field('0', 'UINT32', TOP)
    await open(wrapper)

    await click(wrapper, 1)

    expect(edits(wrapper)).toEqual(['2147483648'])
  })

  it('toggle bit 31 of an INT32 as a negative number, and keep the bits below it', async () => {
    const wrapper = field('0', 'INT32', TOP)
    await open(wrapper)

    await click(wrapper, 1)
    expect(edits(wrapper)).toEqual(['-2147483648'])
    expect(selected(wrapper)).toEqual([false, true])
    await click(wrapper, 0)

    expect(edits(wrapper)[1]).toBe('-2147483647')
  })

  it('take a UINT32 value above 2^31 as it is, with its top bit set', async () => {
    const wrapper = field('4294967295', 'UINT32', TOP)
    await open(wrapper)

    expect(selected(wrapper)).toEqual([true, true])
    expect(summary(wrapper)).toContain('other bits: 0x7FFFFFFE')
  })
})
