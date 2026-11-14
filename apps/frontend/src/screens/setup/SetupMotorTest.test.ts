// The motor test section of the Motors page against the mock backend. A motor spins only while a button is held, with the box
// "The propellers are off" ticked, and every way a hold can end is a test of its own: let go, the pointer leaving, a key going
// up, the window losing the focus, the page going away, the vehicle gone, armed or not known, and the backend ending it. The
// buttons are the frame, by the test order (A, B, C, D), never an output.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, nextTick, ref } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { IGNORE_AFTER_UNLOCK_MS } from '@/lib/setup/motorTest'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'
import SetupMotorTest from './SetupMotorTest.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/**
 * Lets time pass (real time: the page's own timers are what is tested).
 *
 * @param ms how long
 */
async function wait(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms)
  })
  await flushPromises()
}

/**
 * The section over a connected simulated vehicle that is disarmed.
 *
 * @param params the vehicle's parameters
 * @param kept the throttle that was kept in the settings, as text, if one was
 * @returns the section and what drives it
 */
async function page(params = SETUP_PARAMS, kept?: string) {
  const control: MockControl = {}
  const backend = mockBackend({ telemetryMs: 600_000, params, control })
  const handle = createConfigurator(backend, () => Promise.resolve(true))
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })

  if (kept !== undefined) {
    await handle.settings.setUi('motorTest.throttle', kept)
  }
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await flushPromises()
  // (inside a KeepAlive, as the shell and Setup keep their pages: a page that is left is deactivated, not unmounted)
  const shown = ref(true)
  const host = defineComponent({ render: () => h(KeepAlive, null, shown.value ? [h(SetupMotorTest)] : []) })
  mounted = mount(host, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle, control, mock: control.motors!, shown }
}

type Rig = Awaited<ReturnType<typeof page>>

/**
 * A pointer event, as a browser sends it (jsdom has no PointerEvent).
 *
 * @param wrapper the page
 * @param motor the button's letter
 * @param type the event
 * @param init its fields
 */
async function fire(wrapper: VueWrapper, motor: string, type: string, init: MouseEventInit = {}): Promise<void> {
  wrapper.get(`[data-motor="${motor}"]`).element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))
  await flushPromises()
}

/**
 * Ticks "The propellers are off" and waits until presses are taken.
 *
 * @param rig the page
 */
async function unlock(rig: Rig): Promise<void> {
  await rig.wrapper.get('.kit-tick input').setValue(true)
  await wait(IGNORE_AFTER_UNLOCK_MS + 50)
}

/**
 * Presses a button, and waits for the motor.
 *
 * @param rig the page
 * @param motor the button's letter
 */
async function press(rig: Rig, motor = 'A'): Promise<void> {
  await fire(rig.wrapper, motor, 'pointerdown', { button: 0 })
  await wait(20)
}

it('draws the buttons of the frame, labelled by the test order and not by any output, where the motors are', async () => {
  const { wrapper } = await page()
  const buttons = wrapper.findAll('.motor-test-motor')

  // (FRAME_CLASS 1, FRAME_TYPE 1: a quad X)
  expect(buttons.map(button => button.text())).toEqual(['A', 'B', 'C', 'D'])
  expect(buttons.map(button => button.attributes('aria-label'))).toEqual([
    'Motor A, turns counter-clockwise: hold to spin',
    'Motor B, turns clockwise: hold to spin',
    'Motor C, turns counter-clockwise: hold to spin',
    'Motor D, turns clockwise: hold to spin',
  ])
  // the way each turns is drawn, in the order of the test (a quad X)
  expect(wrapper.findAll('.motor-test-spin').map(spin => spin.attributes('data-spin'))).toEqual(['ccw', 'cw', 'ccw', 'cw'])
  expect(wrapper.findAll('.motor-test-spin').map(spin => spin.text())).toEqual(['↺', '↻', '↺', '↻'])

  // A is front right (the front is up), D front left
  const place = (letter: string) => {
    const { left, top } = (wrapper.get(`[data-motor="${letter}"]`).element.parentElement as HTMLElement).style

    return [Number.parseFloat(left), Number.parseFloat(top)]
  }
  expect(place('A')[0]).toBeGreaterThan(50)
  expect(place('A')[1]).toBeLessThan(50)
  expect(place('D')[0]).toBeLessThan(50)
  expect(place('D')[1]).toBeLessThan(50)
  expect(place('B')[1]).toBeGreaterThan(50)
})

it('offers no buttons for a frame it has no layout for, and says why', async () => {
  const { wrapper } = await page(SETUP_PARAMS.map(param => (param.id === 'FRAME_CLASS' ? { ...param, value: 7 } : param)))

  expect(wrapper.findAll('.motor-test-motor')).toHaveLength(0)
  expect(wrapper.get('#setup-motor-test-nolayout').text()).toContain('no drawing for this frame')
})

it('warns about the propellers, and keeps the buttons locked until they are said to be off', async () => {
  const { wrapper, mock } = await page()
  expect(wrapper.get('#setup-motor-test-warning').text()).toContain('TAKE THE PROPELLERS OFF')

  for (const button of wrapper.findAll('.motor-test-motor')) {
    expect(button.attributes('disabled')).toBeDefined()
  }
  await fire(wrapper, 'A', 'pointerdown', { button: 0 })
  await wait(20)

  expect(mock.began()).toBe(0)
})

it('ignores a press in the first moments after the tick, and takes it after', async () => {
  const rig = await page()
  await rig.wrapper.get('.kit-tick input').setValue(true)
  await wait(50)
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeDefined()
  await press(rig)
  expect(rig.mock.began()).toBe(0)

  await wait(IGNORE_AFTER_UNLOCK_MS)
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeUndefined()
  await press(rig)
  expect(rig.mock.began()).toBe(1)
})

it('spins the motor named by the letter for as long as the button is held, and stops it when it is let go', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig, 'B')

  // B is the second motor of the test order, whatever output it is
  expect(rig.mock.running()).toEqual({ motor: 2, throttle: 5 })
  expect(rig.wrapper.get('#setup-motor-test-status').text()).toBe('Motor B is running. Let go of the button to stop it.')
  expect(rig.wrapper.get('[data-motor="B"]').attributes('aria-pressed')).toBe('true')
  // one motor at a time: the others cannot be pressed
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeDefined()
  await fire(rig.wrapper, 'B', 'pointerup')

  expect(rig.mock.running()).toBeNull()
  expect(rig.mock.released()).toBe(1)
  expect(rig.wrapper.get('#setup-motor-test-status').text()).toBe('Motor B stopped.')
})

for (const [kept, sent] of [['99', 20], ['0', 1], ['abc', 5], ['12', 12]] as const) {
  it(`takes the throttle that was kept ("${kept}") held to 1 to 20 percent: ${sent}, and never more`, async () => {
    const rig = await page(SETUP_PARAMS, kept)
    await unlock(rig)
    await press(rig)

    expect(rig.mock.running()?.throttle).toBe(sent)
  })
}

it('the slider cannot go above 20 percent', async () => {
  const { wrapper } = await page()
  const slider = wrapper.get<HTMLInputElement>('.motor-test-throttle')

  expect(slider.attributes('max')).toBe('20')
  expect(slider.attributes('min')).toBe('1')
})

// Every way a hold can end.

it('lets go when the pointer leaves the button', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  await fire(rig.wrapper, 'A', 'pointerleave')

  expect(rig.mock.running()).toBeNull()
  expect(rig.mock.released()).toBe(1)
})

it('lets go when the pointer is cancelled or loses its capture', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  await fire(rig.wrapper, 'A', 'lostpointercapture')

  expect(rig.mock.released()).toBe(1)
})

it('is held from the keyboard by Space, ignores the key repeating, and lets go when the key goes up', async () => {
  const rig = await page()
  await unlock(rig)
  const button = rig.wrapper.get('[data-motor="C"]')
  await button.trigger('keydown', { key: ' ' })
  await button.trigger('keydown', { key: ' ', repeat: true })
  await button.trigger('keydown', { key: ' ', repeat: true })
  await wait(20)

  expect(rig.mock.began()).toBe(1)
  expect(rig.mock.running()?.motor).toBe(3)
  await button.trigger('keyup', { key: ' ' })
  await flushPromises()
  expect(rig.mock.released()).toBe(1)
})

it('lets go when the button loses the focus', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  await rig.wrapper.get('[data-motor="A"]').trigger('blur')
  await flushPromises()

  expect(rig.mock.released()).toBe(1)
})

it('lets go when the window loses the focus', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  window.dispatchEvent(new Event('blur'))
  await flushPromises()

  expect(rig.mock.released()).toBe(1)
})

it('lets go when the page is hidden', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()

  expect(rig.mock.released()).toBe(1)
})

it('lets go when the window closes (the page is unmounted)', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  rig.wrapper.unmount()
  mounted = undefined
  await flushPromises()

  expect(rig.mock.running()).toBeNull()
  expect(rig.mock.released()).toBe(1)
})

it('lets go on a page change (the page is kept alive, so it is deactivated), and is locked again when it is back', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  rig.shown.value = false
  await flushPromises()

  expect(rig.mock.running()).toBeNull()
  expect(rig.mock.released()).toBe(1)
  rig.shown.value = true
  await flushPromises()
  expect((rig.wrapper.get('.kit-tick input').element as HTMLInputElement).checked).toBe(false)
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeDefined()
})

it('lets go when the box is unticked while a motor spins', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  await rig.wrapper.get('.kit-tick input').setValue(false)
  await flushPromises()

  expect(rig.mock.released()).toBe(1)
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeDefined()
})

it('lets go, and locks, when the vehicle is no longer known to be disarmed, or is gone', async () => {
  const first = await page()
  await unlock(first)
  await press(first)
  feed(first.handle, { telemetry: { ...telemetryAt(0), armed: true, heartbeatAgeMs: 4000 } })
  await flushPromises()
  expect(first.mock.released()).toBe(1)
  expect((first.wrapper.get('.kit-tick input').element as HTMLInputElement).checked).toBe(false)
  expect(first.wrapper.get('#setup-motor-test-block').text()).toContain('not known')
  first.wrapper.unmount()
  mounted = undefined

  const second = await page()
  await unlock(second)
  await press(second)
  second.control.connection?.({ state: 'disconnected' })
  await flushPromises()
  expect(second.mock.released()).toBe(1)
  expect(second.wrapper.get('#setup-motor-test-block').text()).toContain('Connect a vehicle')
})

it('does not take the armed flag of its own test for a vehicle that is armed', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  // the vehicle arms its motors for the test, and says so
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await wait(300)

  expect(rig.mock.released()).toBe(0)
  expect(rig.mock.running()).not.toBeNull()
  expect(rig.wrapper.find('#setup-motor-test-block').exists()).toBe(false)
  await fire(rig.wrapper, 'A', 'pointerup')
})

it('locks the buttons for a vehicle that is armed, with the reason in words, and starts nothing', async () => {
  const rig = await page()
  await unlock(rig)
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(rig.wrapper.get('#setup-motor-test-block').text()).toContain('The vehicle is armed')
  expect((rig.wrapper.get('.kit-tick input').element as HTMLInputElement).checked).toBe(false)
  // (ticking it again unlocks nothing: the buttons are locked by the vehicle's state too)
  await rig.wrapper.get('.kit-tick input').setValue(true)
  await wait(IGNORE_AFTER_UNLOCK_MS + 50)
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeDefined()
  await press(rig)
  expect(rig.mock.began()).toBe(0)
})

for (const why of ['SILENT', 'LINK_LOST', 'REFUSED']) {
  it(`takes the unlock away when the backend ends the test with ${why}, not by the button being let go`, async () => {
    const rig = await page()
    await unlock(rig)
    await press(rig)
    rig.mock.end(why)
    await flushPromises()

    expect(rig.mock.running()).toBeNull()
    expect((rig.wrapper.get('.kit-tick input').element as HTMLInputElement).checked).toBe(false)
    expect(rig.wrapper.get('#setup-motor-test-status').text()).toMatch(/motor A/i)
  })
}

it('says in words why the backend ended the test', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  rig.mock.end('LINK_LOST')
  await flushPromises()

  expect(rig.wrapper.get('#setup-motor-test-status').text()).toContain('The link to the vehicle was lost')
})

it('keeps the unlock when the button is let go as meant', async () => {
  const rig = await page()
  await unlock(rig)
  await press(rig)
  await fire(rig.wrapper, 'A', 'pointerup')
  await nextTick()

  expect((rig.wrapper.get('.kit-tick input').element as HTMLInputElement).checked).toBe(true)
})

it('has no way to start a test but a pressed button: a click does nothing', async () => {
  const rig = await page()
  await unlock(rig)
  await rig.wrapper.get('[data-motor="A"]').trigger('click')
  await wait(20)

  expect(rig.mock.began()).toBe(0)
})

it('offers no test for a frame that was changed since the vehicle started, and says why', async () => {
  const rig = await page()
  await unlock(rig)
  // the Frame page wrote FRAME_TYPE (a plus), read back at once; the vehicle has not restarted
  rig.control.announce?.('FRAME_TYPE', 0)
  await flushPromises()

  expect(rig.wrapper.get('#setup-motor-test-block').text()).toContain('fixes the order of its motors when it starts')
  expect((rig.wrapper.get('.kit-tick input').element as HTMLInputElement).checked).toBe(false)
  expect(rig.wrapper.get('[data-motor="A"]').attributes('disabled')).toBeDefined()
  await rig.wrapper.get('.kit-tick input').setValue(true)
  await wait(IGNORE_AFTER_UNLOCK_MS + 50)
  await press(rig)
  expect(rig.mock.began()).toBe(0)
})

it('offers the test again when the frame is back to the one the vehicle started with', async () => {
  const rig = await page()
  rig.control.announce?.('FRAME_TYPE', 0)
  await flushPromises()
  expect(rig.wrapper.find('#setup-motor-test-block').exists()).toBe(true)
  rig.control.announce?.('FRAME_TYPE', 1)
  await flushPromises()

  expect(rig.wrapper.find('#setup-motor-test-block').exists()).toBe(false)
})

it('names each "Confirmed" mark with its motor, so the four are not the same to a screen reader', async () => {
  const { wrapper } = await page()
  const names = wrapper.findAll('.motor-test-confirm input').map(box => box.attributes('aria-label'))

  expect(names).toEqual(['Motor A confirmed', 'Motor B confirmed', 'Motor C confirmed', 'Motor D confirmed'])
})

it('marks a motor confirmed only once it was tested, per session, and the mark is gone with the connection', async () => {
  const rig = await page()
  const mark = () => rig.wrapper.get<HTMLInputElement>('[data-confirm="A"] input')
  expect(mark().element.disabled).toBe(true)

  await unlock(rig)
  await press(rig)
  await fire(rig.wrapper, 'A', 'pointerup')
  await flushPromises()
  expect(mark().element.disabled).toBe(false)
  expect(rig.wrapper.get('[data-confirm="A"]').text()).toBe('Confirmed')
  await mark().setValue(true)
  expect(rig.handle.motorTest.confirmed.value).toEqual([1])
  expect(mark().element.checked).toBe(true)
  // B was not tested: its mark cannot be made
  expect(rig.wrapper.get<HTMLInputElement>('[data-confirm="B"] input').element.disabled).toBe(true)

  rig.control.connection?.({ state: 'disconnected' })
  await flushPromises()
  expect(rig.handle.motorTest.confirmed.value).toEqual([])
  expect(rig.handle.motorTest.tested.value).toEqual([])
})
