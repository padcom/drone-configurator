import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import FlightData from './FlightData.vue'
import { mockBackend } from '@/mock/mock-backend'
import { withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'

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
  expect(wrapper.find('.fly-aside svg.hud').exists()).toBe(true)
})

it('has the HUD and the six cards of the design in the aside, all never reported without a vehicle', async () => {
  const wrapper = await screen()
  const cards = wrapper.findAll('.fly-aside .fly-cards .truth')

  expect(cards.map(card => card.get('.label').text())).toEqual(['BATTERY', 'WIND', 'GPS', 'LINK', 'EKF', 'VIBRATION'])
  expect(cards.map(card => card.attributes('data-state'))).toEqual(Array(6).fill('never'))
  expect(cards.map(card => card.get('.visually-hidden').text())).toEqual(Array(6).fill('not reported'))
})

it('has the six cards as its telemetry, and no other block of values below the messages', async () => {
  const wrapper = await screen()

  expect(wrapper.find('.fly-aside #telemetry.fly-cards').exists()).toBe(true)
  expect(wrapper.findAll('.fly-aside > *').map(part => part.classes()[0])).toEqual(['hud', 'fly-cards', 'messages'])
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
