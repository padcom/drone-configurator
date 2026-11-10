import { afterEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { PARAMS } from './fixtures'
import ParamGroups from './ParamGroups.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

/**
 * The group list on a fresh Configurator that holds the fixture parameters.
 *
 * @returns the component and the Configurator
 */
function groups() {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'complete' })

  return { wrapper: mount(ParamGroups, withI18n), handle }
}

it('is a named navigation with All first and the count of every group', () => {
  const { wrapper } = groups()

  expect(wrapper.get('nav').attributes('aria-label')).toBe('Parameter groups')
  const labels = wrapper.findAll('button').map(button => button.text())
  expect(labels[0]).toBe(`All${PARAMS.length}`)
  expect(labels).toContain('BATT2')
})

it('marks the chosen group, All at first, and chooses with a click', async () => {
  const { wrapper } = groups()
  expect(wrapper.get('button[data-group=""]').attributes('aria-pressed')).toBe('true')

  await wrapper.get('button[data-group="BATT"]').trigger('click')

  expect(useParamGroup().chosen.value).toBe('BATT')
  expect(wrapper.get('button[data-group="BATT"]').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('button[data-group=""]').attributes('aria-pressed')).toBe('false')
})

it('goes back to All when the chosen group is not in the list any more', async () => {
  const { wrapper, handle } = groups()
  await wrapper.get('button[data-group="BATT"]').trigger('click')

  feed(handle, { params: PARAMS.filter(param => !param.id.startsWith('BATT_')) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('button[data-group=""]').attributes('aria-pressed')).toBe('true')
})
