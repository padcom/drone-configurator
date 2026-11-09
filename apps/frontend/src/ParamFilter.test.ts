import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ParamFilter from './ParamFilter.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { VEHICLE } from './fixtures'

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

it('offers Download only while connected and not downloading', async () => {
  const { wrapper, handle, refresh } = filterWithSpies()
  expect(wrapper.get('#refresh').attributes('disabled')).toBeDefined()

  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  await wrapper.get('#refresh').trigger('click')
  expect(refresh).toHaveBeenCalledTimes(1)

  feed(handle, { list: 'loading' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#refresh').attributes('disabled')).toBeDefined()
})
