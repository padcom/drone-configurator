// The controls of a flight: they show what the vehicle says, the actions that fit it, and every action that changes how it flies
// asks first (a hold; a plain confirmation for a mode of an armed vehicle, except the four that never ask).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetModeConfirmationChoice } from '@/composables/useModeConfirmation'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { askedOf, sentOf } from '@/testing/arming'
import { feed } from '@/testing/testing'
import FlightStrip from './FlightStrip.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetModeConfirmationChoice()
  mounted?.unmount()
  mounted = undefined
})

/** What the vehicle says in a test. */
interface Said {
  armed: boolean
  mode: string
  heartbeatAgeMs?: number
}

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
 * @param ui the settings' entries
 * @returns the strip and what drives it
 */
async function strip(telemetry: Said, ui: { key: string, value: string }[] = []): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control, settings: { version: 1, ui } }))
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

it('says disarmed, and has the review and nothing that disarms or stops', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'STABILIZE' })

  expect(wrapper.get('#strip-state').text()).toContain('Disarmed')
  expect(wrapper.find('[data-command-button="vehicle.review"]').text()).toBe('Review and arm')
  expect(wrapper.find('[data-command-button="vehicle.disarm"]').exists()).toBe(false)
  expect(wrapper.find('.kit-menu').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Emergency stop')
})

it('says armed, and has Disarm and, under More, the emergency stop in red', async () => {
  const { wrapper } = await strip({ armed: true, mode: 'LOITER' })

  expect(wrapper.get('#strip-state').text()).toContain('Armed')
  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(false)
  expect(wrapper.get('[data-command-button="vehicle.disarm"]').text()).toBe('Disarm')
  // (the stop is not on the screen until More is opened)
  expect(wrapper.text()).not.toContain('Emergency stop')
  await wrapper.get('.kit-menu button').trigger('click')

  const item = wrapper.get('[role="menuitem"]')
  expect(item.text()).toBe('Emergency stop')
  expect(item.classes()).toContain('danger')
})

it('counts a state that is not known as armed: no arm, a Disarm that says why it may not run, the stop', async () => {
  const { wrapper } = await strip({ armed: true, mode: 'LOITER', heartbeatAgeMs: 5000 })

  expect(wrapper.get('#strip-state').text()).toContain('State not known')
  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(false)
  const disarm = wrapper.get('[data-command-button="vehicle.disarm"]')
  expect(disarm.attributes('aria-disabled')).toBe('true')
  expect(wrapper.find('.kit-menu').exists()).toBe(true)
})

it('asks for a RED hold before the emergency stop, and sends it once when it is held', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' })
  await rig.wrapper.get('.kit-menu button').trigger('click')
  await rig.wrapper.get('[role="menuitem"]').trigger('click')
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

it('lists the modes of the vehicle\'s kind, with the one its heartbeat names selected', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'POSHOLD' })
  const list = wrapper.get<HTMLSelectElement>('#strip-mode')

  expect(list.findAll('option').map(option => option.text())).toContain('RTL')
  expect(list.element.value).toBe('POSHOLD')
})

it('asks nothing of a disarmed vehicle for a mode, sends it, and keeps showing the mode the heartbeat names', async () => {
  const rig = await strip({ armed: false, mode: 'STABILIZE' })
  await rig.wrapper.get('#strip-mode').setValue('AUTO')
  await flushPromises()

  expect(rig.handle.confirmation.value).toBeNull()
  expect(sentOf(rig.control)).toEqual(['mode 3'])
  // the list does not say AUTO until the vehicle does
  expect(rig.wrapper.get<HTMLSelectElement>('#strip-mode').element.value).toBe('STABILIZE')
})

it('asks a plain confirmation naming the mode of an armed vehicle, and sends it only when it is yes', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' })
  await rig.wrapper.get('#strip-mode').setValue('AUTO')
  await flushPromises()

  expect(askedOf(rig.handle)).toMatchObject({ level: 'plain', title: 'Change the flight mode to AUTO' })
  expect(sentOf(rig.control)).toEqual([])
  await answer(rig, false)

  expect(sentOf(rig.control)).toEqual([])
  await rig.wrapper.get('#strip-mode').setValue('GUIDED')
  await flushPromises()
  await answer(rig, true)

  expect(sentOf(rig.control)).toEqual(['mode 4'])
})

it('asks nothing for RTL of an armed vehicle: one deliberate press', async () => {
  const rig = await strip({ armed: true, mode: 'AUTO' })
  await rig.wrapper.get('#strip-mode').setValue('RTL')
  await flushPromises()

  expect(rig.handle.confirmation.value).toBeNull()
  expect(sentOf(rig.control)).toEqual(['mode 6'])
})

it('asks nothing for another mode either, when Settings say so', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' }, [{ key: 'confirm.mode', value: 'none' }])
  await rig.wrapper.get('#strip-mode').setValue('GUIDED')
  await flushPromises()

  expect(rig.handle.confirmation.value).toBeNull()
  expect(sentOf(rig.control)).toEqual(['mode 4'])
})
