import { afterEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import EnumField from './EnumField.vue'
import type { EnumOption } from './enumField'
import { withI18n } from './testing'

const OPTIONS: EnumOption[] = [
  { value: 0, label: 'Report only' },
  { value: 1, label: 'Return or land' },
  { value: 2, label: 'Always land' },
]

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * A field holding a value.
 *
 * @param value the number it holds
 * @returns the wrapper (its `update:modelValue` events say what was picked)
 */
function field(value: number): VueWrapper {
  mounted = mount(EnumField, {
    ...withI18n,
    props: { modelValue: value, options: OPTIONS, label: 'Failsafe action' },
    attachTo: document.body,
  })

  return mounted
}

/**
 * The values that were picked, in order.
 *
 * @param wrapper the field
 * @returns the numbers
 */
const picked = (wrapper: VueWrapper) => (wrapper.emitted('update:modelValue') ?? []).map(args => args[0])

describe('the field at rest', () => {
  it('shows the name of its value with the number at the right, and is a combobox with a name', () => {
    const wrapper = field(1)
    const input = wrapper.get('input')

    expect((input.element as HTMLInputElement).value).toBe('Return or land')
    expect(wrapper.get('.enum-badge').text()).toBe('1')
    expect(input.attributes('aria-autocomplete')).toBe('list')
    expect(input.attributes('aria-describedby')).toBeUndefined()
    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-label')).toBe('Failsafe action')
    expect(input.attributes('aria-expanded')).toBe('false')
  })

  it('shows a number that has no name as it is, and says it has no name', () => {
    const wrapper = field(7)

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('7')
    expect(wrapper.get('.enum-badge').text()).toBe('no name')
  })
})

describe('the field, for a screen reader', () => {
  it('tells a screen reader that the number has no name: the badge is for the eye', () => {
    const wrapper = field(7)
    const described = wrapper.get('input').attributes('aria-describedby') ?? ''

    expect(wrapper.get(`#${CSS.escape(described)}`).text()).toBe('no name')
    expect(wrapper.get(`#${CSS.escape(described)}`).classes()).toContain('visually-hidden')
    expect(wrapper.get('.enum-badge').attributes('aria-hidden')).toBe('true')
  })

  it('has no such text for a value that has a name, or while something is being typed', async () => {
    expect(field(1).find('.visually-hidden').exists()).toBe(false)
    const wrapper = field(7)

    await wrapper.get('input').setValue('3')

    expect(wrapper.find('.visually-hidden').exists()).toBe(false)
  })

  it('is named by a label for it when it is given the id of the field, and by its own label otherwise', () => {
    mounted = mount(EnumField, {
      ...withI18n,
      props: { modelValue: 1, options: OPTIONS, label: 'Failsafe action', inputId: 'the-field' },
      attachTo: document.body,
    })

    expect(mounted.get('input').attributes('id')).toBe('the-field')
    expect(mounted.get('input').attributes('aria-label')).toBeUndefined()
  })
})

describe('the list', () => {
  it('opens when the field is focused, with every option and the current one marked', async () => {
    const wrapper = field(2)

    await wrapper.get('input').trigger('focus')

    expect(wrapper.get('input').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[role="option"]').map(o => o.find('.name').text())).toEqual(OPTIONS.map(o => o.label))
    expect(wrapper.findAll('[role="option"]').map(o => o.attributes('aria-selected'))).toEqual(['false', 'false', 'true'])
  })

  it('takes a click on an option, and closes', async () => {
    const wrapper = field(0)
    await wrapper.get('input').trigger('focus')

    await wrapper.findAll('[role="option"]')[1]?.trigger('click')

    expect(picked(wrapper)).toEqual([1])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('filters by what is typed, by name and by the start of a number', async () => {
    const wrapper = field(0)
    await wrapper.get('input').setValue('land')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2)

    await wrapper.get('input').setValue('2')
    expect(wrapper.findAll('[role="option"]').map(o => o.find('.num').text())).toEqual(['2'])
  })
})

describe('the list, with nothing to match', () => {
  it('says there is no match for text that fits nothing', async () => {
    const wrapper = field(0)

    await wrapper.get('input').setValue('xyz')

    expect(wrapper.get('.none').text()).toBe('No match. Type a number to use it.')
  })
})

describe('a number with no name', () => {
  it('is offered as it is, and taken with Enter', async () => {
    const wrapper = field(0)
    await wrapper.get('input').setValue('9')
    expect(wrapper.get('.option.custom').text()).toContain('Use this number, it has no name')

    await wrapper.get('input').trigger('keydown', { key: 'Enter' })

    expect(picked(wrapper)).toEqual([9])
  })

  it('is used when the field is left with it typed', async () => {
    const wrapper = field(0)
    await wrapper.get('input').setValue('9')

    await wrapper.get('input').trigger('blur')

    expect(picked(wrapper)).toEqual([9])
  })

  it('is not offered for a number that has a name', async () => {
    const wrapper = field(0)

    await wrapper.get('input').setValue('1')

    expect(wrapper.find('.option.custom').exists()).toBe(false)
  })
})

describe('the keys', () => {
  it('move the highlight with the arrows and take it with Enter', async () => {
    const wrapper = field(0)
    const input = wrapper.get('input')

    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-activedescendant')).toContain('-1')
    await input.trigger('keydown', { key: 'Enter' })

    expect(picked(wrapper)).toEqual([1])
  })
})

describe('the keys that close and the one that takes the only option', () => {
  it('close the list with Escape, and forget what was typed', async () => {
    const wrapper = field(1)
    const input = wrapper.get('input')
    await input.setValue('al')

    await input.trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect((input.element as HTMLInputElement).value).toBe('Return or land')
    expect(picked(wrapper)).toEqual([])
  })
})

/**
 * Presses Escape in the field the way a browser does: a key event that can be cancelled and that bubbles.
 *
 * @param wrapper the field
 * @returns the event, to see whether its default action (closing a native dialog) was prevented
 */
function pressEscape(wrapper: VueWrapper): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
  wrapper.get('input').element.dispatchEvent(event)

  return event
}

describe('Escape in a dialog', () => {
  it('has its default action prevented while the list is open (a native dialog closes on that default)', async () => {
    const wrapper = field(1)
    await wrapper.get('input').trigger('focus')

    expect(pressEscape(wrapper).defaultPrevented).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('is left alone once the list is closed, so that it goes on to the dialog', async () => {
    const wrapper = field(1)
    await wrapper.get('input').trigger('focus')
    pressEscape(wrapper)

    expect(pressEscape(wrapper).defaultPrevented).toBe(false)
  })

  it('does not reach the listeners round the field while the list is open, and does after', async () => {
    const wrapper = field(1)
    const outside = vi.fn()
    document.body.addEventListener('keydown', outside)
    await wrapper.get('input').trigger('focus')

    pressEscape(wrapper)
    expect(outside).not.toHaveBeenCalled()
    pressEscape(wrapper)

    expect(outside).toHaveBeenCalledOnce()
    document.body.removeEventListener('keydown', outside)
  })
})

describe('a field that is not valid', () => {
  it('says so to a screen reader and points to the reason, together with the note for a number that has no name', () => {
    mounted = mount(EnumField, {
      ...withI18n,
      props: { modelValue: 7, options: OPTIONS, label: 'Failsafe action', invalid: true, describedby: 'why' },
      attachTo: document.body,
    })
    const input = mounted.get('input')

    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toMatch(/^why .+-noname$/u)
  })

  it('has neither when it is valid', () => {
    const input = field(1).get('input')

    expect(input.attributes('aria-invalid')).toBeUndefined()
    expect(input.attributes('aria-describedby')).toBeUndefined()
  })
})

describe('the only option left', () => {
  it('is taken with Enter', async () => {
    const wrapper = field(0)
    await wrapper.get('input').setValue('always')

    await wrapper.get('input').trigger('keydown', { key: 'Enter' })

    expect(picked(wrapper)).toEqual([2])
  })
})
