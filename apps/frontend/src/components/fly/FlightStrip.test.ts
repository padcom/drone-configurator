// The controls of a flight that are not in the top bar: what the vehicle says of its checks, and Disarm and the emergency stop
// (under More) while it is armed or its state is not known. Every action asks first, with a hold. Arming and the flight mode are
// the top bar's (TopBarControls.test.ts).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { armMayBeOn, forgetArmGrace } from '@/composables/useArmGrace'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { askedOf, sentOf } from '@/testing/arming'
import { feed } from '@/testing/testing'
import FlightStrip from './FlightStrip.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetArmGrace()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** What the vehicle says in a test. */
interface Said {
  armed: boolean
  mode: string
  heartbeatAgeMs?: number
}

/** What a test drives: the strip, the Configurator and the mock's controls. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
}

/**
 * The strip over a connected vehicle that says it is as the test says.
 *
 * @param telemetry what the vehicle says (armed, mode, the age of its heartbeat)
 * @param telemetry.armed whether it says it is armed
 * @param telemetry.mode the mode it names
 * @param telemetry.heartbeatAgeMs how old its heartbeat is (ms)
 * @returns the strip and what drives it
 */
async function strip(telemetry: Said): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(telemetry.armed)
  feed(handle, { telemetry: { ...telemetryAt(0), ...telemetry } })
  await vi.waitFor(() => expect(handle.setup.modes.value).not.toBeNull())
  mounted = mount(FlightStrip, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

/**
 * Says yes or no to the question the strip asked.
 *
 * @param rig the rig
 * @param yes the answer
 */
async function answer(rig: Rig, yes: boolean): Promise<void> {
  rig.handle.confirmation.value?.answer(yes)
  await flushPromises()
}

it('does not say the armed state: the top bar does. It says what the vehicle says of its checks', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'STABILIZE' })

  expect(wrapper.text()).not.toMatch(/disarmed|armed/iu)
  expect(wrapper.get('#strip-checks').text()).toBe('Checks not reported')
})

it('has nothing that arms or disarms or stops for a disarmed vehicle (arming is the top bar\'s), no mode list', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'STABILIZE' })

  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(false)
  expect(wrapper.find('[data-command-button="vehicle.arm"]').exists()).toBe(false)
  expect(wrapper.find('#strip-mode').exists()).toBe(false)
  expect(wrapper.find('[data-command-button="vehicle.disarm"]').exists()).toBe(false)
  expect(wrapper.find('#flight-strip .strip-actions .kit-menu').exists()).toBe(false)
})

it('has Disarm and, under More, the emergency stop in red, for an armed vehicle', async () => {
  const { wrapper } = await strip({ armed: true, mode: 'LOITER' })

  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(false)
  expect(wrapper.get('[data-command-button="vehicle.disarm"]').text()).toBe('Disarm')
  // (the stop is not on the screen until More is opened)
  expect(wrapper.text()).not.toContain('Emergency stop')
  await wrapper.get('.strip-actions .kit-menu button').trigger('click')

  const item = wrapper.get('.strip-actions [role="menuitem"]')
  expect(item.text()).toBe('Emergency stop')
  expect(item.classes()).toContain('danger')
})

it('counts a state that is not known as armed: no arm, a Disarm that says why it may not run, the stop', async () => {
  const { wrapper } = await strip({ armed: true, mode: 'LOITER', heartbeatAgeMs: 5000 })

  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(false)
  expect(wrapper.get('[data-command-button="vehicle.disarm"]').attributes('aria-disabled')).toBe('true')
  expect(wrapper.find('.strip-actions .kit-menu').exists()).toBe(true)
})

it('keeps Disarm and the stop at hand after an arm was accepted, until the heartbeat says', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'STABILIZE' })
  armMayBeOn()
  await flushPromises()

  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(false)
  expect(wrapper.find('[data-command-button="vehicle.disarm"]').exists()).toBe(true)
  expect(wrapper.find('.strip-actions .kit-menu').exists()).toBe(true)
  forgetArmGrace()
  await flushPromises()

  expect(wrapper.find('[data-command-button="vehicle.disarm"]').exists()).toBe(false)
})

it('asks for a RED hold before the emergency stop, and sends it once when it is held', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' })
  await rig.wrapper.get('.strip-actions .kit-menu button').trigger('click')
  await rig.wrapper.get('.strip-actions [role="menuitem"]').trigger('click')
  await flushPromises()

  expect(askedOf(rig.handle)).toMatchObject({ level: 'hold', tone: 'error' })
  expect(askedOf(rig.handle)?.confirmLabel).toBe('Hold to stop the motors')
  expect(sentOf(rig.control)).toEqual([])
  await answer(rig, true)

  expect(sentOf(rig.control)).toEqual(['stop'])
})

it('sends nothing when the hold is not held', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' })
  await rig.wrapper.get('[data-command-button="vehicle.disarm"]').trigger('click')
  await flushPromises()

  expect(askedOf(rig.handle)).toMatchObject({ level: 'hold', confirmLabel: 'Hold to disarm' })
  await answer(rig, false)

  expect(sentOf(rig.control)).toEqual([])
})
