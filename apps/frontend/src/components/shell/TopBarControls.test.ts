// The two cells of the top bar that are controls. STATE of a disarmed vehicle starts arming: the review when there is something
// to review, else straight to the hold (which has no Cancel button: a cross and Escape turn it down, and the hold button has the
// focus). An armed vehicle's STATE is only words. MODE opens a list of modes: keys that move over it send nothing, the mode the
// heartbeat names cannot be chosen again, a mode of an armed vehicle asks (except RTL, Land, Loiter and Brake), and the list
// scrolls when the window is shorter than it.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { forgetArmGrace } from '@/composables/useArmGrace'
import { useArmReview } from '@/composables/useArmReview'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetModeConfirmationChoice } from '@/composables/useModeConfirmation'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { askedOf, sentOf } from '@/testing/arming'
import { feed } from '@/testing/testing'
import TopBar from './TopBar.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetModeConfirmationChoice()
  forgetArmGrace()
  useArmReview().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** What the vehicle says in a test. */
interface Said {
  armed: boolean
  mode: string
  /** What its pre-arm checks say: passing, failing, or nothing (it does not say). */
  checks?: 'passing' | 'failing'
}

/** What a test drives. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
}

/**
 * The top bar over a connected vehicle that says what the test says.
 *
 * @param said what the vehicle says
 * @param ui the settings' entries
 * @returns the bar and what drives it
 */
async function bar(said: Said, ui: { key: string, value: string }[] = []): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control, settings: { version: 1, ui } }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(said.armed)
  const prearm = said.checks === undefined ? {} : { prearm: { enabled: true, passing: said.checks === 'passing', ageMs: 100 } }
  feed(handle, { telemetry: { ...telemetryAt(0), armed: said.armed, mode: said.mode, ...prearm } })
  await vi.waitFor(() => expect(handle.setup.modes.value).not.toBeNull())
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  mounted = mount(TopBar, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

/**
 * Says yes or no to the question that was asked.
 *
 * @param rig the rig
 * @param yes the answer
 */
async function answer(rig: Rig, yes: boolean): Promise<void> {
  rig.handle.confirmation.value?.answer(yes)
  await flushPromises()
}

/**
 * Opens the list of modes and chooses one.
 *
 * @param rig the rig
 * @param name the mode
 */
async function chooseMode(rig: Rig, name: string): Promise<void> {
  await rig.wrapper.get('.cell.mode .kit-menu button').trigger('click')
  const item = rig.wrapper.findAll('.cell.mode [role="menuitem"]').find(candidate => candidate.text().startsWith(name))
  await item?.trigger('click')
  await flushPromises()
}

it('makes STATE of a disarmed vehicle the arm control, in the words of the state', async () => {
  const { wrapper } = await bar({ armed: false, mode: 'STABILIZE', checks: 'passing' })

  expect(wrapper.get('#state-arm').text()).toBe('disarmed')
  expect(wrapper.get('.cell.state dt').text()).toBe('STATE')
})

it('has no arm control in STATE of an armed vehicle: it is only words', async () => {
  const { wrapper } = await bar({ armed: true, mode: 'LOITER' })

  expect(wrapper.find('#state-arm').exists()).toBe(false)
  expect(wrapper.get('.cell.state dd').text()).toBe('ARMED')
})

it('goes to the review when the vehicle says its checks do not pass, or does not say', async () => {
  for (const checks of ['failing', undefined] as const) {
    // eslint-disable-next-line no-await-in-loop -- one vehicle after the other
    const rig = await bar({ armed: false, mode: 'STABILIZE', checks })
    // eslint-disable-next-line no-await-in-loop
    await rig.wrapper.get('#state-arm').trigger('click')
    // eslint-disable-next-line no-await-in-loop
    await flushPromises()

    expect(useArmReview().open.value, String(checks)).toBe(true)
    expect(askedOf(rig.handle)).toBeUndefined()
    useArmReview().hide()
    mounted?.unmount()
  }
})

it('goes straight to the hold when the checks pass: "Arm the vehicle", Hold to arm, a cross, no Cancel', async () => {
  const rig = await bar({ armed: false, mode: 'STABILIZE', checks: 'passing' })
  await rig.wrapper.get('#state-arm').trigger('click')
  await flushPromises()

  expect(useArmReview().open.value).toBe(false)
  const asked = askedOf(rig.handle)

  expect(asked).toMatchObject({ title: 'Arm the vehicle', level: 'hold', confirmLabel: 'Hold to arm', dismissal: 'cross' })
  expect(sentOf(rig.control)).toEqual([])
  await answer(rig, true)

  expect(sentOf(rig.control)).toEqual(['arm'])
})

it('sends nothing when the hold is turned down (the cross and Escape answer no)', async () => {
  const rig = await bar({ armed: false, mode: 'STABILIZE', checks: 'passing' })
  await rig.wrapper.get('#state-arm').trigger('click')
  await flushPromises()
  await answer(rig, false)

  expect(sentOf(rig.control)).toEqual([])
})

it('lists the modes in a menu in MODE, named for a screen reader; the mode that is now cannot be chosen', async () => {
  const rig = await bar({ armed: false, mode: 'POSHOLD' })
  const button = rig.wrapper.get('.cell.mode .kit-menu button')

  expect(button.text()).toBe('POSHOLD')
  expect(button.attributes('aria-label')).toBe('Mode: POSHOLD')
  await button.trigger('click')
  const items = rig.wrapper.findAll('.cell.mode [role="menuitem"]')

  expect(items.map(item => item.text())).toContain('RTL')
  expect(items.find(item => item.text().startsWith('POSHOLD'))?.attributes('disabled')).toBeDefined()
})

it('sends NOTHING for keys that move over the modes: ArrowDown on the button, ArrowDown and Escape in the menu', async () => {
  const rig = await bar({ armed: true, mode: 'LOITER' })
  await rig.wrapper.get('.cell.mode .kit-menu button').trigger('keydown', { key: 'ArrowDown' })
  await flushPromises()

  const menu = rig.wrapper.get('.cell.mode [role="menu"]')
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'Escape']) {
    // eslint-disable-next-line no-await-in-loop -- one key after the other
    await menu.trigger('keydown', { key })
  }
  await flushPromises()

  expect(sentOf(rig.control)).toEqual([])
  expect(askedOf(rig.handle)).toBeUndefined()
})

it('asks nothing of a disarmed vehicle for a mode, sends it, and keeps naming the mode the heartbeat names', async () => {
  const rig = await bar({ armed: false, mode: 'STABILIZE' })
  await chooseMode(rig, 'AUTO')

  expect(askedOf(rig.handle)).toBeUndefined()
  expect(sentOf(rig.control)).toEqual(['mode 3'])
  expect(rig.wrapper.get('.cell.mode .kit-menu button').text()).toBe('STABILIZE')
})

it('asks a plain confirmation naming the mode of an armed vehicle, and sends it only when it is yes', async () => {
  const rig = await bar({ armed: true, mode: 'LOITER' })
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
  const rig = await bar({ armed: true, mode: 'AUTO' })
  await chooseMode(rig, 'RTL')

  expect(askedOf(rig.handle)).toBeUndefined()
  expect(sentOf(rig.control)).toEqual(['mode 6'])
})

it('asks nothing for another mode either, when Settings say so', async () => {
  const rig = await bar({ armed: true, mode: 'LOITER' }, [{ key: 'confirm.mode', value: 'none' }])
  await chooseMode(rig, 'GUIDED')

  expect(askedOf(rig.handle)).toBeUndefined()
  expect(sentOf(rig.control)).toEqual(['mode 4'])
})
