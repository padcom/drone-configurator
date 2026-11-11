import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ParamFilter from './ParamFilter.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { VEHICLE } from '@/mock/fixtures'
import { askForFocus } from '@/composables/useFocusIntent'

/**
 * Mounts the filter on a fresh Configurator whose actions are spies.
 *
 * @returns the component, the Configurator and the spies
 */
function filterWithSpies() {
  const handle = createConfigurator(mockBackend())
  const setFilter = vi.spyOn(handle.parameters, 'setFilter').mockImplementation(() => undefined)
  const refresh = vi.spyOn(handle.parameters, 'refresh').mockResolvedValue()

  return { wrapper: mount(ParamFilter, withI18n), handle, setFilter, refresh }
}

it('passes on what is typed, and shows the filter the Configurator holds', async () => {
  const { wrapper, handle, setFilter } = filterWithSpies()

  await wrapper.get('#filter').setValue('batt')
  expect(setFilter).toHaveBeenCalledWith('batt')

  feed(handle, { filter: 'rtl' })
  await wrapper.vm.$nextTick()
  expect((wrapper.get('#filter').element as HTMLInputElement).value).toBe('rtl')
})

it('has Download as the kit\'s default button, like Save snapshot (no accent or primary fill)', () => {
  const { wrapper } = filterWithSpies()
  const classes = wrapper.get('#refresh').classes()

  expect(classes).toContain('kit-button')
  expect(classes).not.toContain('primary')
  expect(classes).not.toContain('flight')
  expect(wrapper.get('#refresh .command-button-label').text()).toBe('Download')
})

it('offers Download only while connected and not downloading', async () => {
  const { wrapper, handle, refresh } = filterWithSpies()
  expect(wrapper.get('#refresh').attributes('aria-disabled')).toBe('true')

  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  await wrapper.get('#refresh').trigger('click')
  expect(refresh).toHaveBeenCalledTimes(1)

  feed(handle, { list: 'loading' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#refresh').attributes('aria-disabled')).toBe('true')
})

it('takes the focus when it is shown after a command asked for it, once, and not when nobody asked', async () => {
  const unasked = mount(ParamFilter, { ...withI18n, attachTo: document.body })
  await vi.waitFor(() => expect(document.activeElement).not.toBe(unasked.get('#filter').element))
  unasked.unmount()

  askForFocus('params.search')
  const asked = mount(ParamFilter, { ...withI18n, attachTo: document.body })
  await vi.waitFor(() => expect(document.activeElement).toBe(asked.get('#filter').element))
  asked.unmount()

  const again = mount(ParamFilter, { ...withI18n, attachTo: document.body })
  await vi.waitFor(() => expect(document.activeElement).not.toBe(again.get('#filter').element))
  again.unmount()
})
