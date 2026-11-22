// A field bound to a parameter: it says in words whether it shows the vehicle's value, a modified draft, a write under way, a
// write the vehicle read back (verified) or rejected, and a draft over a value the vehicle changed (a conflict, settled by the
// person); and it is a number, a choice from names or the bits of a bitmask.
import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import BitField from './BitField.vue'
import EnumField from './EnumField.vue'
import ParamField from './ParamField.vue'
import type { FieldFacts } from '@/lib/params/fieldState'
import { bitOptions } from '@/lib/params/bitmask'
import { withI18n } from '@/testing/testing'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * A field for a number in centimetres (shown as metres), from 2 m to 30 m.
 *
 * @param facts what differs from a vehicle that holds 15 m and no draft
 * @param more what else to give it
 * @returns the wrapper
 */
function field(facts: Partial<FieldFacts> = {}, more: Record<string, unknown> = {}): VueWrapper {
  mounted = mount(ParamField, {
    ...withI18n,
    props: {
      name: 'RTL_ALT',
      kind: 'number',
      unit: 'cm',
      min: 200,
      max: 3000,
      facts: { vehicle: 1500, draft: null, basis: undefined, write: 'idle', ...facts },
      ...more,
    },
    attachTo: document.body,
  })

  return mounted
}

/**
 * What the field says of itself.
 *
 * @param wrapper the field
 * @returns the words
 */
function says(wrapper: VueWrapper): string {
  return wrapper.get('.status').text()
}

/**
 * How many times the field said something.
 *
 * @param wrapper the field
 * @param name the event
 * @returns how many
 */
function count(wrapper: VueWrapper, name: string): number {
  return (wrapper.emitted(name) ?? []).length
}

/**
 * Presses a button of the conflict.
 *
 * @param wrapper the field
 * @param index which one
 */
async function clickAt(wrapper: VueWrapper, index: number): Promise<void> {
  await wrapper.findAll('.conflict-box button')[index]?.trigger('click')
}

describe('the vehicle\'s value', () => {
  it('is shown in the unit a person reads, and said to be the vehicle\'s', () => {
    const wrapper = field()

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('15')
    expect(says(wrapper)).toBe('The vehicle\'s value.')
    expect(wrapper.get('.param-field').attributes('data-status')).toBe('vehicle')
    expect(wrapper.find('.conflict-box').exists()).toBe(false)
  })

  it('is not there before the vehicle has said it: the field is off and says so', () => {
    const wrapper = field({ vehicle: undefined })

    expect(says(wrapper)).toBe('Not read from the vehicle yet.')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  })
})

describe('a draft', () => {
  it('is shown instead of the vehicle\'s value, and said to be modified, with what the vehicle has', () => {
    const wrapper = field({ draft: 1800, basis: 1500 })

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('18')
    expect(says(wrapper)).toBe('Modified: the vehicle has 15 m.')
    expect(wrapper.get('.param-field').attributes('data-status')).toBe('draft')
  })

  it('is said when it is made: the stored value', async () => {
    const wrapper = field()

    await wrapper.get('input').setValue('20')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('draft')).toEqual([[2000]])
  })
})

describe('a write that is under way', () => {
  it('is said, and the control is off: what is typed then could not be written', () => {
    const wrapper = field({ draft: 1800, basis: 1500, write: 'writing' })

    expect(says(wrapper)).toBe('Writing to the vehicle…')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  })
})

describe('a write that is verified', () => {
  it('says the vehicle read the value back, with a mark that is not only a colour', () => {
    const wrapper = field({ vehicle: 1800, draft: 1800, basis: 1500, write: 'verified' })

    expect(says(wrapper)).toBe('Verified: the vehicle reads 18 m back.')
    expect(wrapper.find('.status svg').exists()).toBe(true)
    expect(wrapper.get('.param-field').attributes('data-status')).toBe('verified')
  })
})

describe('a write that is rejected', () => {
  it('says why, in the vehicle\'s words when they are given', () => {
    const wrapper = field({ draft: 1800, basis: 1500, write: 'rejected' }, { rejection: 'the value is not allowed in this mode' })

    expect(says(wrapper)).toBe('Rejected: the value is not allowed in this mode')
    expect(wrapper.get('.param-field').attributes('data-status')).toBe('rejected')
  })

  it('says it in plain words when the vehicle gave none, and keeps the draft in the field', () => {
    const wrapper = field({ draft: 1800, basis: 1500, write: 'rejected' })

    expect(says(wrapper)).toBe('Rejected: the vehicle did not accept the value')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('18')
  })
})

describe('a draft over a value the vehicle changed', () => {
  it('keeps the draft, says what happened, and asks which to keep', () => {
    const wrapper = field({ vehicle: 1600, draft: 1800, basis: 1500 })

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('18')
    expect(says(wrapper)).toBe('Changed on the vehicle: it has 16 m.')
    expect(wrapper.get('.conflict-box').text()).toContain('The vehicle changed RTL_ALT to 16 m while you were editing it.')
    expect(wrapper.get('.conflict-box').text()).toContain('Your draft is 18 m.')
    expect(wrapper.get('.conflict-box').attributes('role')).toBe('alert')
  })

  it('is settled by the person: keep the draft, or take the vehicle\'s value', async () => {
    const wrapper = field({ vehicle: 1600, draft: 1800, basis: 1500 })
    const buttons = wrapper.findAll('.conflict-box button')

    expect(buttons.map(button => button.text())).toEqual(['Keep my draft', 'Use the vehicle\'s value'])
    await clickAt(wrapper, 0)
    expect([count(wrapper, 'keep'), count(wrapper, 'take')]).toEqual([1, 0])
    await clickAt(wrapper, 1)
    expect(count(wrapper, 'take')).toBe(1)
  })
})

describe('a choice from names', () => {
  const options = [{ value: 0, label: 'Report only' }, { value: 1, label: 'Return or land' }]

  it('shows the name of the value, and says a draft when another is picked', () => {
    const wrapper = field({ vehicle: 1 }, { kind: 'enum', options, min: undefined, max: undefined, unit: undefined })

    wrapper.getComponent(EnumField).vm.$emit('update:modelValue', 0)

    expect(wrapper.getComponent(EnumField).props('modelValue')).toBe(1)
    expect(wrapper.emitted('draft')).toEqual([[0]])
    expect(says(wrapper)).toBe('The vehicle\'s value.')
  })
})

describe('the bits of a bitmask', () => {
  it('says a draft when a bit is toggled, as the number it makes', () => {
    const bits = bitOptions({ 0: 'All', 1: 'Barometer', 2: 'Compass' }, 'INT32')
    const wrapper = field({ vehicle: 1 }, { kind: 'bits', bits, type: 'INT32', min: undefined, max: undefined, unit: undefined })

    wrapper.getComponent(BitField).vm.$emit('edit', '5')
    wrapper.getComponent(BitField).vm.$emit('edit', 'not a number')

    expect(wrapper.emitted('draft')).toEqual([[5]])
  })
})
