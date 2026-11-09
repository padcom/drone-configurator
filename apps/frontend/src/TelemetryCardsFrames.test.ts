import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TelemetryCards from './TelemetryCards.vue'
import { mockBackend } from './mock-backend'
import { feed, nextFrame, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { telemetryAt } from './fixtures'

// Counts how often the cards are worked out: once per render of the component.
const { cardsFor } = vi.hoisted(() => ({ cardsFor: vi.fn() }))

vi.mock('./telemetryCards', async importOriginal => {
  const original = await importOriginal<typeof import('./telemetryCards')>()
  cardsFor.mockImplementation(original.cardsFor)

  return { ...original, cardsFor }
})

it('renders the cards once for a burst of 100 telemetry events in one frame', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(TelemetryCards, withI18n)
  await flushPromises()
  cardsFor.mockClear()

  for (let n = 1; n <= 100; n += 1) {
    feed(handle, { telemetry: telemetryAt(n) })
  }
  await nextFrame()
  await wrapper.vm.$nextTick()

  expect(cardsFor).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('11.60 V · 0%')
})

it('renders again for the next frame\'s telemetry, once', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(TelemetryCards, withI18n)
  await flushPromises()
  feed(handle, { telemetry: telemetryAt(1) })
  await nextFrame()
  await wrapper.vm.$nextTick()
  cardsFor.mockClear()

  feed(handle, { telemetry: telemetryAt(2) })
  feed(handle, { telemetry: telemetryAt(3) })
  await nextFrame()
  await wrapper.vm.$nextTick()

  expect(cardsFor).toHaveBeenCalledTimes(1)
})
