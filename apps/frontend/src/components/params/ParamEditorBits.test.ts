// The Value field of a parameter whose metadata has bits (a Bitmask): the field of bits instead of the number or the names, the
// draft following the toggles, and the change queued when the value is settled, never in the middle of the toggles.
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import ParamEditor from './ParamEditor.vue'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'

const BITS = { 0: 'All', 1: 'Barometer', 2: 'Compass', 3: 'GPS lock' }

/**
 * The editor on a Configurator with the fixture parameters, connected, with ARMING_CHECK (an INT32 holding 1) selected.
 *
 * @param meta what the metadata says about ARMING_CHECK
 * @param select the parameter that is selected
 * @returns the component and the Configurator
 */
async function screen(meta: object, select = 'ARMING_CHECK') {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, { ...withI18n, attachTo: document.body })
  await flushPromises()
  feed(handle, {
    params: PARAMS,
    metadata: new Map([[select, meta], ['RTL_ALT', meta]]),
    connection: { state: 'connected', vehicle: { ...VEHICLE } },
  })
  handle.parameters.select(select)
  await wrapper.vm.$nextTick()

  return { wrapper, handle }
}

const rows = (wrapper: Awaited<ReturnType<typeof screen>>['wrapper']) => wrapper.findAll('[role="option"]')

describe('the Value field of a parameter with bits', () => {
  it('is the field of bits, in the same id, with the number the vehicle holds', async () => {
    const { wrapper } = await screen({ bits: BITS })
    const field = wrapper.get<HTMLInputElement>('#draft')

    expect(field.attributes('role')).toBe('combobox')
    expect(field.element.value).toBe('1')
    expect(wrapper.get('.bit-summary').text()).toBe('1 bit: All')
    expect(wrapper.find('.enum-badge').exists()).toBe(false)
  })

  it('wins over the names of the values when the metadata has both', async () => {
    const { wrapper } = await screen({ bits: BITS, values: { 0: 'Disabled', 1: 'Enabled' } })

    await wrapper.get('#draft').trigger('focus')

    expect(wrapper.find('.bit-field').exists()).toBe(true)
    expect(rows(wrapper).map(row => row.text())).toEqual(['Allbit 0', 'Barometerbit 1', 'Compassbit 2', 'GPS lockbit 3'])
  })

  it('is not used for a real number, which has no bits', async () => {
    const { wrapper } = await screen({ bits: BITS }, 'BATT_LOW_VOLT')

    expect(wrapper.find('.bit-field').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('#draft').element.value).toBe('10.5')
  })
})

describe('the toggles of a parameter with bits', () => {
  it('change the draft as they are made, and queue nothing until the value is settled', async () => {
    const { wrapper, handle } = await screen({ bits: BITS })
    await wrapper.get('#draft').trigger('focus')

    await rows(wrapper)[3]!.trigger('click')
    await rows(wrapper)[2]!.trigger('click')

    expect(handle.fields.draft.value).toBe('13')
    expect(handle.staged.changes.value).toEqual([])
  })

  it('are queued with Enter, as the number they make', async () => {
    const { wrapper, handle } = await screen({ bits: BITS })
    await wrapper.get('#draft').trigger('focus')
    await rows(wrapper)[3]!.trigger('click')

    await wrapper.get('#draft').trigger('keydown', { key: 'Enter' })

    expect(handle.staged.changes.value).toEqual([{ id: 'ARMING_CHECK', from: 1, to: 9 }])
  })
})

describe('the settling of a parameter with bits', () => {
  it('is when the field is left, and the value back at the vehicle\'s takes the change out again', async () => {
    const { wrapper, handle } = await screen({ bits: BITS })
    await wrapper.get('#draft').trigger('focus')
    await rows(wrapper)[1]!.trigger('click')
    await wrapper.get('#draft').trigger('blur')
    expect(handle.staged.changes.value).toEqual([{ id: 'ARMING_CHECK', from: 1, to: 3 }])

    await wrapper.get('#draft').trigger('focus')
    await rows(wrapper)[1]!.trigger('click')
    await wrapper.get('#draft').trigger('blur')

    expect(handle.staged.changes.value).toEqual([])
  })

  it('keep the bits that the metadata does not name', async () => {
    const { wrapper, handle } = await screen({ bits: BITS }, 'RTL_ALT')
    await wrapper.get('#draft').trigger('focus')

    await rows(wrapper)[0]!.trigger('click')
    await wrapper.get('#draft').trigger('keydown', { key: 'Enter' })

    expect(handle.staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1501 }])
    expect(wrapper.get('.bit-summary').text()).toBe('3 bits: All, Compass, GPS lock; other bits: 0x5D0')
  })
})

describe('a number typed in a parameter with bits', () => {
  it('is taken that is typed, and the boxes follow it', async () => {
    const { wrapper, handle } = await screen({ bits: BITS })
    await wrapper.get('#draft').trigger('focus')

    await wrapper.get('#draft').setValue('6')

    expect(handle.fields.draft.value).toBe('6')
    expect(rows(wrapper).map(row => row.attributes('aria-selected'))).toEqual(['false', 'true', 'true', 'false'])
  })
})
