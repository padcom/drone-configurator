// Values in the fields of the Setup pages are shown as ArduPilot would print them: the shortest text that is the same float (a
// vehicle that holds 14.8 volts sends 14.800000190734863, and a person must read 14.8), never the digits that only the widening
// to a double put there. Each page that has a text field for a float is mounted over a vehicle that holds such a value.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import type { Param } from '@/generated/app'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupBattery from './SetupBattery.vue'
import SetupFailsafes from './SetupFailsafes.vue'
import SetupMotors from './SetupMotors.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** The floats a vehicle holds (what it sends is the double of the float). */
const FLOATS: Record<string, number> = {
  BATT_LOW_VOLT: 14.8,
  BATT_CRT_VOLT: 13.2,
  MOT_SPIN_ARM: 0.1,
  MOT_SPIN_MIN: 0.15,
  MOT_SPIN_MAX: 0.95,
}

/**
 * The page over a vehicle that holds those floats.
 *
 * @param page the page
 * @returns the page's wrapper
 */
async function shown(page: ReturnType<typeof defineComponent>): Promise<VueWrapper> {
  const params: Param[] = SETUP_PARAMS.map(param => {
    const value = FLOATS[param.id]

    return value === undefined ? param : { ...param, kind: 'real', type: 'REAL32', value: Math.fround(value) }
  })
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params }), () => Promise.resolve(true))
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(page) }), { global: { plugins: [i18n, router] } })
  await flushPromises()

  return mounted
}

/**
 * Whether a text has the digits that only the widening of a float to a double puts in a number (a float has 7 digits at most).
 *
 * @param text what a field holds
 * @returns true if it has them
 */
function widened(text: string): boolean {
  return /\d\.\d{7,}/u.test(text)
}

/**
 * What every text field of a wrapper holds.
 *
 * @param wrapper the page
 * @returns the texts
 */
function fields(wrapper: VueWrapper): string[] {
  return wrapper.findAll<HTMLInputElement>('input').map(field => field.element.value)
}

it('shows the spin thresholds of the Motors page as the floats they are: 0.1, 0.15, 0.95', async () => {
  const wrapper = await shown(SetupMotors)

  const texts = fields(wrapper)
  expect(texts).toContain('0.1')
  expect(texts).toContain('0.15')
  expect(texts).toContain('0.95')
  expect(texts.some(widened)).toBe(false)
})

it('shows the voltages of the Failsafes page as the floats they are: 14.8 and 13.2', async () => {
  const wrapper = await shown(SetupFailsafes)

  const texts = fields(wrapper)
  expect(texts).toContain('14.8')
  expect(texts).toContain('13.2')
  expect(texts.some(widened)).toBe(false)
})

it('shows no field of the Battery page with the digits of a widened float', async () => {
  const wrapper = await shown(SetupBattery)

  expect(fields(wrapper).some(widened)).toBe(false)
})
