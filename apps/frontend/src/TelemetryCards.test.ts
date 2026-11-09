import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TelemetryCards from './TelemetryCards.vue'
import { mockBackend } from './mock-backend'
import { createConfigurator } from './useConfigurator'
import { telemetryAt } from './fixtures'
import type { Telemetry } from './generated/app'

/**
 * Mounts the cards on a fresh Configurator, with `telemetry` already received.
 *
 * @param telemetry what the vehicle sent, or null
 * @returns the mounted component
 */
async function cardsWith(telemetry: Telemetry | null) {
  const { fields } = createConfigurator(mockBackend())
  const wrapper = mount(TelemetryCards)
  fields.telemetry.value = telemetry
  await wrapper.vm.$nextTick()

  return wrapper
}

it('shows the cards', async () => {
  const wrapper = await cardsWith(telemetryAt(10))

  expect(wrapper.text()).toContain('LOITER')
  expect(wrapper.text()).toContain('ARMED')
  expect(wrapper.text()).toContain('12.50 V · 90%')
  expect(wrapper.find('.card.warn').exists()).toBe(true)
})

it('says to connect when there is no telemetry', async () => {
  expect((await cardsWith(null)).text()).toContain('No telemetry')
})

it('shows a dash for what the vehicle has not reported yet, not zeros', async () => {
  const wrapper = await cardsWith({ armed: false, mode: 'STABILIZE', heartbeatAgeMs: 100 })

  const values = wrapper.findAll('.card').map(card => card.text())
  expect(values).toContain('Battery—')
  expect(values).toContain('Attitude—')
  expect(wrapper.find('.card.warn').exists()).toBe(false)
})

it('marks a stale heartbeat', async () => {
  const wrapper = await cardsWith({ ...telemetryAt(1), heartbeatAgeMs: 3500 })

  expect(wrapper.find('.card.warn').text()).toBe('Heartbeat3500 ms ago')
})

it('shows the mode as text, not markup', async () => {
  const wrapper = await cardsWith({ armed: false, mode: '<b>X</b>', heartbeatAgeMs: 1 })

  expect(wrapper.text()).toContain('<b>X</b>')
  expect(wrapper.find('b').exists()).toBe(false)
})
