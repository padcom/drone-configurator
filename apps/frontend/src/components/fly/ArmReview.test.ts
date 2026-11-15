// The review before arming: it asks the vehicle to run its checks, says how the vehicle says they are, lists what it said
// of them lately (its own words, wherever and whenever it said them), and its "Arm…" only leads to the hold: it arms nothing.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { useArmReview } from '@/composables/useArmReview'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { askedOf, printsPrearm, sentOf } from '@/testing/arming'
import { feed } from '@/testing/testing'
import ArmReview from './ArmReview.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  useArmReview().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** What a test drives. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
}

/**
 * The review over a connected, disarmed vehicle, with the checks as given.
 *
 * @param prearm what the vehicle's pre-arm bit says
 * @param prearm.enabled whether the vehicle has an arming check on
 * @param prearm.passing whether its checks pass
 * @param texts the pre-arm texts the vehicle prints when its checks are run, and has already said once
 * @returns the review and what drives it
 */
async function review(prearm: { enabled: boolean, passing: boolean }, texts: string[] = []): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(false)
  printsPrearm(control, texts)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, prearm: { ...prearm, ageMs: 100 } } })
  handle.messages.start()
  await vi.waitFor(() => expect(handle.messages.list.value.length).toBeGreaterThan(0))
  mounted = mount(ArmReview, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

it('is not there until it is asked for', async () => {
  const { wrapper } = await review({ enabled: true, passing: true })

  expect(wrapper.find('dialog').exists()).toBe(false)
})

it('asks the vehicle to run its checks when it opens, and says what the vehicle says of them', async () => {
  const { wrapper, control, handle } = await review({ enabled: true, passing: true })
  handle.messages.list.value = []
  useArmReview().show()
  await flushPromises()

  expect(sentOf(control)).toEqual(['prearm'])
  expect(wrapper.get('#review-state').text()).toBe('The vehicle says its pre-arm checks pass.')
  expect(wrapper.get('#review-clear').text()).toContain('Nothing to list')
})

it('does not list a text the vehicle said lately when its checks pass now: it is no reason any more', async () => {
  const { wrapper, handle } = await review({ enabled: true, passing: true })

  // (the vehicle said "PreArm: Compass not calibrated" when it connected: it is still in the list of its messages)
  expect(handle.messages.list.value.some(message => message.text.startsWith('PreArm'))).toBe(true)
  useArmReview().show()
  await flushPromises()

  expect(wrapper.find('#review-reasons').exists()).toBe(false)
  expect(wrapper.find('#review-clear').exists()).toBe(true)
})

it('says the vehicle has said nothing of a problem when its checks do not pass and it has said none', async () => {
  const { wrapper, handle } = await review({ enabled: true, passing: false })
  handle.messages.list.value = []
  useArmReview().show()
  await flushPromises()

  expect(wrapper.get('#review-none').text()).toContain('has not said anything about a problem')
})

it('lists the vehicle\'s own words about why its checks do not pass, as it said them, with what it said earlier', async () => {
  const { wrapper } = await review({ enabled: true, passing: false }, ['Compasses inconsistent', 'GPS 1: Bad fix'])
  useArmReview().show()
  await flushPromises()

  expect(wrapper.get('#review-state').text()).toBe('The vehicle says its pre-arm checks do not pass.')
  const texts = wrapper.findAll('#review-reasons .review-text').map(item => item.text())
  // (the first is what the vehicle said when it connected: the answer to an arm may carry none, the vehicle's words are all here)
  expect(texts).toEqual(['PreArm: Compass not calibrated', 'PreArm: Compasses inconsistent', 'PreArm: GPS 1: Bad fix'])
})

it('says the checks are off when the vehicle has every arming check off', async () => {
  const off = await review({ enabled: false, passing: false })
  useArmReview().show()
  await flushPromises()

  expect(off.wrapper.get('#review-state').text()).toContain('arms without looking')
})

it('can run the checks again, and does not run two at once', async () => {
  const { wrapper, control } = await review({ enabled: true, passing: false }, ['RC not found'])
  useArmReview().show()
  await flushPromises()
  await wrapper.get('#review-again').trigger('click')
  await flushPromises()

  expect(sentOf(control)).toEqual(['prearm', 'prearm'])
})

it('leads to the hold with "Arm…", and arms nothing itself', async () => {
  const rig = await review({ enabled: true, passing: true })
  useArmReview().show()
  await flushPromises()
  await rig.wrapper.get('#review-arm').trigger('click')
  await flushPromises()

  expect(rig.wrapper.find('dialog').exists()).toBe(false)
  expect(askedOf(rig.handle)).toMatchObject({ level: 'hold', confirmLabel: 'Hold to arm' })
  expect(sentOf(rig.control)).toEqual(['prearm'])
})

it('says why the checks could not be run (the vehicle is armed), and offers no arm', async () => {
  const rig = await review({ enabled: true, passing: true })
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  useArmReview().show()
  await flushPromises()

  expect(rig.wrapper.get('#review-error').text()).toContain('armed')
  expect(rig.wrapper.get('#review-arm').attributes('disabled')).toBeDefined()
})

it('closes with Not now', async () => {
  const { wrapper } = await review({ enabled: true, passing: true })
  useArmReview().show()
  await flushPromises()
  await wrapper.get('#review-close').trigger('click')

  expect(wrapper.find('dialog').exists()).toBe(false)
})
