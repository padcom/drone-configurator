// The map of the Plan page takes the view to the plan once: when the plan first has a place, and never again (what the user
// panned to stays).
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { resetPlanForTests } from '@/composables/usePlan'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { seedPlan } from '@/testing/plan'
import FlightMap from '@/components/map/FlightMap.vue'
import PlanMap from './PlanMap.vue'

let mounted: VueWrapper | undefined

beforeEach(() => {
  resetPlanForTests()
  createConfigurator(mockBackend({ telemetryMs: 600_000 }))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * The map, shown.
 *
 * @returns the wrapper
 */
async function shown(): Promise<VueWrapper> {
  mounted = mount(PlanMap, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return mounted
}

/**
 * What the map is told to fit.
 *
 * @param wrapper the page
 * @returns the places
 */
function fitOf(wrapper: VueWrapper): unknown {
  return wrapper.getComponent(FlightMap).props('fit')
}

it('fits nothing while the plan has no place, the first places when it has, and never follows the plan after', async () => {
  const wrapper = await shown()

  expect(fitOf(wrapper)).toBeUndefined()
  seedPlan(1)
  await flushPromises()
  const first = fitOf(wrapper)

  expect(first).toEqual([{ lat: 52, lon: 21 }])
  seedPlan(3)
  await flushPromises()

  expect(fitOf(wrapper)).toBe(first)
})

it('is fitted to a plan that was kept while another screen was shown', async () => {
  seedPlan(2)
  const wrapper = await shown()

  expect(fitOf(wrapper)).toEqual([{ lat: 52, lon: 21 }, { lat: 52.0001, lon: 21 }])
})
