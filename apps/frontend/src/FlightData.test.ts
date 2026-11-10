import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import FlightData from './screens/FlightData.vue'
import { mockBackend } from './mock-backend'
import { withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Fly screen on a fresh Configurator.
 *
 * @returns the mounted screen
 */
async function screen(): Promise<VueWrapper> {
  createConfigurator(mockBackend())
  mounted = mount(FlightData, { ...withI18n, attachTo: document.body })
  await flushPromises()

  return mounted
}

it('has the map at the left and the aside at the right, in fixed regions', async () => {
  const wrapper = await screen()

  expect(wrapper.findAll('.fly > *').map(region => region.classes()[0])).toEqual(['fly-main', 'fly-aside'])
  expect(wrapper.get('.fly-main').attributes('aria-label')).toBe('Map')
  expect(wrapper.get('aside').attributes('aria-label')).toBe('Details')
  expect(wrapper.text()).toContain('The map is not available yet.')
  expect(wrapper.text()).toContain('The heads-up display is not available yet.')
})

it('has the telemetry cards in the aside', async () => {
  const wrapper = await screen()

  expect(wrapper.find('.fly-aside #telemetry').exists()).toBe(true)
  expect(wrapper.find('#telemetry').text()).toContain('No telemetry')
})

it('has nothing to resize, collapse or drag: no split bars, no pane buttons, no tabs while there is one view', async () => {
  const wrapper = await screen()

  expect(wrapper.find('[role="separator"]').exists()).toBe(false)
  expect(wrapper.find('.kit-split').exists()).toBe(false)
  expect(wrapper.find('button').exists()).toBe(false)
  expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
})

it('can take the focus in its aside, which F6 goes to, but not by Tab', async () => {
  const wrapper = await screen()

  expect(wrapper.get('aside').attributes('tabindex')).toBe('-1')
})
