// The controls of a flight: they show what the vehicle says of its checks, the actions that fit its state, and every action that
// changes how it flies asks first (a hold; a plain confirmation for a mode of an armed vehicle, except the four that never ask).
// The mode is chosen from a menu: keys that move over it send nothing.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { armMayBeOn, forgetArmGrace } from '@/composables/useArmGrace'
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

/**
 * Opens the menu of the modes, and chooses an item of it.
 *
 * @param rig the rig
 * @param name the mode
 */
async function chooseMode(rig: Rig, name: string): Promise<void> {
  await rig.wrapper.get('#strip-mode .kit-menu button').trigger('click')
  const item = rig.wrapper.findAll('#strip-mode [role="menuitem"]').find(candidate => candidate.text().startsWith(name))
  await item?.trigger('click')
  await flushPromises()
}

it('does not say the armed state: the top bar does. It says what the vehicle says of its checks', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'STABILIZE' })

  expect(wrapper.text()).not.toMatch(/disarmed|armed/iu)
  expect(wrapper.get('#strip-checks').text()).toBe('Checks not reported')
})

it('has the review for a disarmed vehicle, and nothing that disarms or stops', async () => {
  const { wrapper } = await strip({ armed: false, mode: 'STABILIZE' })

  expect(wrapper.find('[data-command-button="vehicle.review"]').text()).toBe('Review and arm')
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

  expect(wrapper.find('[data-command-button="vehicle.review"]').exists()).toBe(true)
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

it('lists the modes in a menu named by the mode the heartbeat says, which cannot be chosen again', async () => {
  const rig = await strip({ armed: false, mode: 'POSHOLD' })

  expect(rig.wrapper.get('#strip-mode .kit-menu button').text()).toBe('Mode: POSHOLD')
  await rig.wrapper.get('#strip-mode .kit-menu button').trigger('click')
  const items = rig.wrapper.findAll('#strip-mode [role="menuitem"]')

  expect(items.map(item => item.text())).toContain('RTL')
  expect(items.find(item => item.text().startsWith('POSHOLD'))?.attributes('disabled')).toBeDefined()
})

it('sends NOTHING for keys that move over the modes: ArrowDown on the button, ArrowDown and Escape in the menu', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' })
  const button = rig.wrapper.get('#strip-mode .kit-menu button')
  await button.trigger('keydown', { key: 'ArrowDown' })
  await flushPromises()

  expect(rig.wrapper.find('#strip-mode [role="menu"]').exists()).toBe(true)
  const menu = rig.wrapper.get('#strip-mode [role="menu"]')
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown']) {
    // eslint-disable-next-line no-await-in-loop -- one key after the other
    await menu.trigger('keydown', { key })
  }
  await menu.trigger('keydown', { key: 'Escape' })
  await flushPromises()

  expect(sentOf(rig.control)).toEqual([])
  expect(askedOf(rig.handle)).toBeUndefined()
})

it('asks nothing of a disarmed vehicle for a mode, sends it, and keeps naming the mode the heartbeat names', async () => {
  const rig = await strip({ armed: false, mode: 'STABILIZE' })
  await chooseMode(rig, 'AUTO')

  expect(askedOf(rig.handle)).toBeUndefined()
  expect(sentOf(rig.control)).toEqual(['mode 3'])
  // the menu does not say AUTO until the vehicle does
  expect(rig.wrapper.get('#strip-mode .kit-menu button').text()).toBe('Mode: STABILIZE')
})

it('asks a plain confirmation naming the mode of an armed vehicle, and sends it only when it is yes', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' })
  await chooseMode(rig, 'AUTO')

  expect(askedOf(rig.handle)).toMatchObject({ level: 'plain', title: 'Change the flight mode to AUTO' })
  expect(sentOf(rig.control)).toEqual([])
  await answer(rig, false)

  expect(sentOf(rig.control)).toEqual([])
  await chooseMode(rig, 'GUIDED')
  await answer(rig, true)

  expect(sentOf(rig.control)).toEqual(['mode 4'])
})

it('asks nothing for RTL of an armed vehicle: one deliberate press (choosing the item)', async () => {
  const rig = await strip({ armed: true, mode: 'AUTO' })
  await chooseMode(rig, 'RTL')

  expect(askedOf(rig.handle)).toBeUndefined()
  expect(sentOf(rig.control)).toEqual(['mode 6'])
})

it('asks nothing for another mode either, when Settings say so', async () => {
  const rig = await strip({ armed: true, mode: 'LOITER' }, [{ key: 'confirm.mode', value: 'none' }])
  await chooseMode(rig, 'GUIDED')

  expect(askedOf(rig.handle)).toBeUndefined()
  expect(sentOf(rig.control)).toEqual(['mode 4'])
})
