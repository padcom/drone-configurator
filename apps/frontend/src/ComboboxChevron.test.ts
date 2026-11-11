// The chevron of a combobox is a toggle: with the list open a press closes it, with the list closed a press opens it, and the
// field has the focus after either (the press does not take it away).
import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import BitField from './BitField.vue'
import { bitOptions } from './bitmask'
import EnumField from './EnumField.vue'
import { withI18n } from './testing'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

const OPTIONS = [{ value: 0, label: 'Zero' }, { value: 1, label: 'One' }]

/**
 * A field on the page, as the user finds it: not focused, list closed.
 *
 * @param kind the field of names or the field of bits
 * @returns the wrapper
 */
function field(kind: 'names' | 'bits'): VueWrapper {
  mounted = kind === 'names'
    ? mount(EnumField, { ...withI18n, props: { modelValue: 1, options: OPTIONS, label: 'Value' }, attachTo: document.body })
    : mount(BitField, {
      ...withI18n,
      props: { options: bitOptions({ 0: 'A', 1: 'B' }, 'UINT8'), type: 'UINT8', value: 0, draft: '0', label: 'Value' },
      attachTo: document.body,
    })

  return mounted
}

const isOpen = (wrapper: VueWrapper) => wrapper.find('[role="listbox"]').exists()

/**
 * Presses the chevron the way the browser does: the press (which does not take the focus), then the click.
 *
 * @param wrapper the field
 * @returns whether the press was kept from moving the focus
 */
async function pressChevron(wrapper: VueWrapper): Promise<boolean> {
  const chevron = wrapper.get('.chevron-hit').element
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  chevron.dispatchEvent(press)
  await wrapper.get('.chevron-hit').trigger('click')

  return press.defaultPrevented
}

describe.each([['names'], ['bits']] as const)('the chevron of the field of %s', kind => {
  it('opens the list when it is closed, with the focus in the field', async () => {
    const wrapper = field(kind)

    expect(await pressChevron(wrapper)).toBe(true)

    expect(isOpen(wrapper)).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('input').element)
  })

  it('closes the list when it is open, with the focus still in the field, and opens it again on the next press', async () => {
    const wrapper = field(kind)
    await wrapper.get('input').trigger('focus')
    wrapper.get<HTMLInputElement>('input').element.focus()
    expect(isOpen(wrapper)).toBe(true)

    await pressChevron(wrapper)
    expect(isOpen(wrapper)).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('input').element)

    await pressChevron(wrapper)
    expect(isOpen(wrapper)).toBe(true)
  })

  it('is out of the reading order of a screen reader (the field is the control)', () => {
    expect(field(kind).get('.chevron-hit').attributes('aria-hidden')).toBe('true')
  })
})

describe('the chevron of the field of bits, closing', () => {
  it('settles the value as Enter does', async () => {
    const wrapper = field('bits')
    await wrapper.get('input').trigger('focus')

    await pressChevron(wrapper)

    expect(wrapper.emitted('settle')).toHaveLength(1)
  })
})
