// The numeric field: the value in the unit a person reads, held to the parameter's limits (with the reason in words and for a
// screen reader), settled by Enter or leaving the field, moved by the arrow keys, and given up by Escape.
import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import NumberField from './NumberField.vue'
import { withI18n } from '@/testing/testing'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * A field for a parameter in centimetres, from 2 m to 30 m, in steps of half a metre.
 *
 * @param value the stored value (cm)
 * @param more what differs
 * @returns the wrapper
 */
function field(value = 1500, more: Record<string, unknown> = {}): VueWrapper {
  mounted = mount(NumberField, {
    ...withI18n,
    props: { modelValue: value, label: 'RTL_ALT', unit: 'cm', min: 200, max: 3000, step: 50, integer: true, ...more },
    attachTo: document.body,
  })

  return mounted
}

/**
 * What the field says was settled, in order.
 *
 * @param wrapper the field
 * @returns the stored values
 */
function said(wrapper: VueWrapper): number[] {
  return (wrapper.emitted('update:modelValue') ?? []).map(args => args[0] as number)
}

/**
 * Types a text into the field.
 *
 * @param wrapper the field
 * @param text the text
 */
async function type(wrapper: VueWrapper, text: string): Promise<void> {
  await wrapper.get('input').setValue(text)
}

/**
 * Presses a key in the field.
 *
 * @param wrapper the field
 * @param key the key
 * @param more what else is down
 */
async function press(wrapper: VueWrapper, key: string, more: KeyboardEventInit = {}): Promise<void> {
  await wrapper.get('input').trigger('keydown', { key, ...more })
}

describe('what the field shows', () => {
  it('is the value in the unit a person reads, with the unit after it, and a name for a screen reader', () => {
    const wrapper = field(1550)

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('15.5')
    expect(wrapper.get('.unit').text()).toBe('m')
    expect(wrapper.get('input').attributes('aria-label')).toBe('RTL_ALT')
    expect(wrapper.find('.reason').exists()).toBe(false)
  })

  it('is a unit as it is where there is nothing better to show it as, and none for no unit', () => {
    expect(field(3300, { unit: 'mAh', min: undefined, max: undefined }).get('.unit').text()).toBe('mAh')
    expect(field(7, { unit: undefined }).find('.unit').exists()).toBe(false)
  })
})

describe('a value that is out of range', () => {
  it('says why in words and to a screen reader, and says nothing to the screen', async () => {
    const wrapper = field()

    await type(wrapper, '1')
    await press(wrapper, 'Enter')

    expect(wrapper.get('.reason').text()).toBe('At least 2 m.')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(wrapper.get('.reason').attributes('id'))
    expect(said(wrapper)).toEqual([])
  })

  it('is told for the highest as well, and for what is not a number or nothing', async () => {
    const wrapper = field()

    await type(wrapper, '31')
    expect(wrapper.get('.reason').text()).toBe('At most 30 m.')
    await type(wrapper, 'abc')
    expect(wrapper.get('.reason').text()).toBe('That is not a number.')
    await type(wrapper, '')
    expect(wrapper.get('.reason').text()).toBe('Enter a number.')
  })
})

describe('a value that is typed', () => {
  it('is said as the stored value when it is entered, and again not when it is the same', async () => {
    const wrapper = field()

    await type(wrapper, '15.5')
    await press(wrapper, 'Enter')
    expect(said(wrapper)).toEqual([1550])
    expect(wrapper.find('.reason').exists()).toBe(false)

    await wrapper.setProps({ modelValue: 1550 })
    await type(wrapper, '15,5')
    await press(wrapper, 'Enter')
    expect(said(wrapper)).toEqual([1550])
  })

  it('is said when the field is left, and a text that is not a value stays with its reason', async () => {
    const wrapper = field()

    await type(wrapper, '20')
    await wrapper.get('input').trigger('blur')
    expect(said(wrapper)).toEqual([2000])

    await type(wrapper, '99')
    await wrapper.get('input').trigger('blur')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('99')
    expect(said(wrapper)).toEqual([2000])
  })
})

describe('a value that is given up', () => {
  it('is dropped with Escape: the field shows the value again', async () => {
    const wrapper = field()

    await type(wrapper, '99')
    await press(wrapper, 'Escape')

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('15')
    expect(wrapper.find('.reason').exists()).toBe(false)
  })
})

describe('the arrow keys', () => {
  it('step the value by the parameter\'s step, and by ten with Shift or the page keys', async () => {
    const wrapper = field(1500)

    await press(wrapper, 'ArrowUp')
    await press(wrapper, 'ArrowDown')
    await press(wrapper, 'ArrowUp', { shiftKey: true })
    await press(wrapper, 'PageDown')

    expect(said(wrapper)).toEqual([1550, 1450, 2000, 1000])
  })

  it('stop at the limits, and step from what is typed when that is a value', async () => {
    const wrapper = field(2980)

    await press(wrapper, 'ArrowUp', { shiftKey: true })
    expect(said(wrapper)).toEqual([3000])
    await type(wrapper, '10')
    await press(wrapper, 'ArrowUp')
    expect(said(wrapper)).toEqual([3000, 1050])
  })
})

describe('a value that is a float', () => {
  it('is said as the number the vehicle holds, which is what it reads back', async () => {
    const wrapper = field(0, { unit: undefined, type: 'REAL32', min: 0, max: 1, integer: false })

    await type(wrapper, '0.1')
    await press(wrapper, 'Enter')

    expect(said(wrapper)).toEqual([Math.fround(0.1)])
  })
})

describe('what is typed when the value changes from outside', () => {
  it('is dropped: the field shows the new value (the vehicle changed it, or its value was taken over a draft)', async () => {
    const wrapper = field(1500)

    await type(wrapper, '99')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('99')
    await wrapper.setProps({ modelValue: 1600 })

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('16')
    expect(wrapper.find('.reason').exists()).toBe(false)
  })
})

describe('what a screen reader is told of a value that is not one', () => {
  const told = (wrapper: VueWrapper): string => wrapper.get('[role="status"]').text()

  it('is nothing while it is typed (a "-" on the way to -5), and the reason once it is tried to be settled', async () => {
    const wrapper = field(1500, { min: -500 })

    await type(wrapper, '-')
    expect(wrapper.get('.reason').text()).toBe('That is not a number.')
    expect(told(wrapper)).toBe('')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await type(wrapper, '-9')
    await press(wrapper, 'Enter')
    expect(told(wrapper)).toBe('At least -5 m.')
  })

  it('is told when the field is left, not again for what is typed after, and nothing for a value that is settled', async () => {
    const wrapper = field()

    await type(wrapper, '99')
    await wrapper.get('input').trigger('blur')
    expect(told(wrapper)).toBe('At most 30 m.')
    await type(wrapper, '9')
    expect(told(wrapper)).toBe('')
    await press(wrapper, 'Enter')
    expect(told(wrapper)).toBe('')
  })
})

describe('a field that is off', () => {
  it('cannot be typed in', () => {
    expect(field(1500, { disabled: true }).get('input').attributes('disabled')).toBeDefined()
  })
})
