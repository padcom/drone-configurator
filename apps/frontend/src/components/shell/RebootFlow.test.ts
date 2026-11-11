// "Reboot flight controller" from the palette, whole, in the shell against the mock backend: found by typing, refused with the
// reason while it may not run, a hold to confirm, the vehicle's answer told in a toast, "Rebooting…" in the top bar while the
// vehicle is gone, and a toast when it is back.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import Shell from './Shell.vue'
import { createConfigurator, useConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useToasts } from '@/composables/toasts'

let mounted: VueWrapper | undefined

/** How long the hold lasts, and the moment a confirmation ignores presses (src/lib/app/safety.ts), with a margin. */
const HOLD_MS = 1200
const ARM_MS = 400

/**
 * The shell on the mock backend with the simulated vehicle connected and disarmed.
 *
 * @param connect whether to connect the vehicle
 * @returns the shell and the mock's controls
 */
async function shellWithVehicle(connect = true) {
  const control: MockControl = {}
  createConfigurator(mockBackend({ control, rebootMs: 400, telemetryMs: 30 }))
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()

  if (connect) {
    await useConfigurator().vehicle.connect({ transport: 'simulator' })
    control.armed?.(false)
    // The page knows whether the vehicle is armed from its telemetry: until the first sample it is not known.
    await vi.waitFor(() => expect(useConfigurator().fields.telemetry.value?.armed).toBe(false))
  }
  await flushPromises()

  return { wrapper: mounted, control }
}

afterEach(() => {
  setLanguage('en')
  // The toasts are the application's: those of one test must not count a repeat of the next one's.
  useToasts().visible.value.forEach(toast => useToasts().dismiss(toast.key))
  useCommandPalette().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** Presses Ctrl+P on the page, as the browser sends it. */
function pressCtrlP(): void {
  const init = { code: 'KeyP', key: 'p', ctrlKey: true, bubbles: true, cancelable: true }
  document.body.dispatchEvent(new KeyboardEvent('keydown', init))
}

/**
 * Types "reboot" into the palette, opened by Ctrl+P, and presses Enter on the row it finds.
 *
 * @param wrapper the shell
 */
async function runReboot(wrapper: VueWrapper): Promise<void> {
  pressCtrlP()
  await flushPromises()
  await wrapper.get('#palette-input').setValue('reboot')
  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  // The question opens a moment after the palette has closed and given the focus back.
  await vi.waitFor(() => expect(wrapper.find('#confirm').exists()).toBe(true))
}

/**
 * What the toasts say now.
 *
 * @returns their texts
 */
const toastTexts = () => useToasts().visible.value.map(toast => toast.text)

/**
 * Holds the confirmation's button for the hold time.
 *
 * @param wrapper the shell
 */
async function hold(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => expect(wrapper.find('#confirm-hold').exists()).toBe(true))
  await new Promise(resolve => {
    setTimeout(resolve, ARM_MS + 50)
  })
  await wrapper.get('#confirm-hold').trigger('pointerdown')
  await new Promise(resolve => {
    setTimeout(resolve, HOLD_MS + 100)
  })
  await flushPromises()
}

it('is found by typing, a row of the Vehicle group with its question a hold', async () => {
  const { wrapper } = await shellWithVehicle()
  await runReboot(wrapper)

  expect(wrapper.find('#palette-input').exists()).toBe(false)
  expect(wrapper.get('#confirm .kit-dialog-title').text()).toBe('Reboot flight controller')
  expect(wrapper.get('#vehicle').text()).toContain('QUADROTOR')
  expect(wrapper.get('#question').text()).toContain('Parameters are not changed')
  expect(wrapper.get('#confirm-hold').text()).toBe('Hold to reboot')
  await wrapper.get('#confirm-cancel').trigger('keydown', { key: 'Escape' })
})

it('refuses with its reason while no vehicle is connected, and sends nothing', async () => {
  const { wrapper, control } = await shellWithVehicle(false)
  pressCtrlP()
  await flushPromises()
  await wrapper.get('#palette-input').setValue('reboot')
  const row = wrapper.get('[data-command="vehicle.reboot"]')

  expect(row.attributes('aria-disabled')).toBe('true')
  expect(row.get('.palette-reason').text()).toBe('Connect to a vehicle first.')
  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
  await flushPromises()

  expect(wrapper.find('#confirm').exists()).toBe(false)
  expect(control.rebootsSent?.()).toBe(0)
})

it('refuses while the vehicle is armed, with the reason, and sends nothing', async () => {
  const { wrapper, control } = await shellWithVehicle()
  control.armed?.(true)
  await vi.waitFor(() => expect(useConfigurator().fields.telemetry.value?.armed).toBe(true))
  pressCtrlP()
  await flushPromises()
  await wrapper.get('#palette-input').setValue('reboot')
  // The telemetry says armed once its next sample comes: wait for it (the page knows what the vehicle last said).
  await vi.waitFor(() => expect(wrapper.get('[data-command="vehicle.reboot"]').attributes('aria-disabled')).toBe('true'), {
    timeout: 3000,
  })

  expect(wrapper.get('[data-command="vehicle.reboot"] .palette-reason').text())
    .toBe('Disarm the vehicle first. A flying vehicle is never rebooted.')
  expect(control.rebootsSent?.()).toBe(0)
})

it('reboots after the hold: tells it, says "Rebooting…" in the top bar while it is gone, tells it is back', async () => {
  const { wrapper, control } = await shellWithVehicle()
  await runReboot(wrapper)
  await hold(wrapper)

  expect(control.rebootsSent?.()).toBe(1)
  expect(toastTexts()).toContain('Rebooting QUADROTOR…')
  await vi.waitFor(() => expect(wrapper.get('.top-bar .vehicle .title').text()).toBe('Rebooting…'))
  expect(wrapper.get('#connection').text()).toContain('rebooting')
  await vi.waitFor(() => expect(toastTexts()).toContain('QUADROTOR is back.'))

  expect(wrapper.get('.top-bar .vehicle .title').text()).toBe('QUADROTOR')
  // No error toast for the quiet that was asked for.
  expect(useToasts().visible.value.some(toast => toast.severity === 'error')).toBe(false)
})

it('cancelling the hold sends nothing', async () => {
  const { wrapper, control } = await shellWithVehicle()
  await runReboot(wrapper)
  await vi.waitFor(() => expect(wrapper.find('#confirm-cancel').exists()).toBe(true))
  await new Promise(resolve => {
    setTimeout(resolve, ARM_MS + 50)
  })
  await wrapper.get('#confirm-cancel').trigger('click')
  await flushPromises()

  expect(wrapper.find('#confirm').exists()).toBe(false)
  expect(control.rebootsSent?.()).toBe(0)
})

it.each([
  ['refused', 'QUADROTOR refused to reboot.'],
  ['unsupported', 'QUADROTOR does not support a reboot from here.'],
  ['no-answer', 'No answer from QUADROTOR. If it is rebooting, the link comes back by itself. If nothing happens, try again.'],
  // (the same words as the unit test's, which split them over lines)
] as const)('tells what the vehicle said: %s', async (answer, text) => {
  const { wrapper, control } = await shellWithVehicle()
  control.rebootAnswer?.(answer)
  await runReboot(wrapper)
  await hold(wrapper)

  expect(toastTexts()).toContain(text)
  expect(control.rebootsSent?.()).toBe(1)
})

it('tells the reason when the backend refuses what the page thought it could do (it looked again)', async () => {
  const { wrapper, control } = await shellWithVehicle()
  await runReboot(wrapper)
  await vi.waitFor(() => expect(wrapper.find('#confirm-hold').exists()).toBe(true))
  // While the question is open, a parameter operation starts: the backend refuses, the page's view was late.
  control.busy?.(true)
  await new Promise(resolve => {
    setTimeout(resolve, ARM_MS + 50)
  })
  await wrapper.get('#confirm-hold').trigger('pointerdown')
  await new Promise(resolve => {
    setTimeout(resolve, HOLD_MS + 100)
  })
  await flushPromises()

  expect(control.rebootsSent?.()).toBe(0)
  expect(toastTexts().some(text => text.startsWith('Parameters are being written or downloaded'))).toBe(true)
})

it('gives the focus back to what had it before the palette opened, after Cancel', async () => {
  const { wrapper } = await shellWithVehicle()
  const link = wrapper.get<HTMLAnchorElement>('nav a')
  link.element.focus()
  await runReboot(wrapper)
  await vi.waitFor(() => expect(wrapper.find('#confirm-cancel').exists()).toBe(true))
  await new Promise(resolve => {
    setTimeout(resolve, ARM_MS + 50)
  })
  await wrapper.get('#confirm-cancel').trigger('click')
  await flushPromises()

  await vi.waitFor(() => expect(document.activeElement).toBe(link.element))
})

it('gives the focus back to what had it before the palette opened, after the hold', async () => {
  const { wrapper } = await shellWithVehicle()
  const link = wrapper.get<HTMLAnchorElement>('nav a')
  link.element.focus()
  await runReboot(wrapper)
  await hold(wrapper)

  await vi.waitFor(() => expect(wrapper.find('#confirm').exists()).toBe(false))
  await vi.waitFor(() => expect(document.activeElement).toBe(link.element))
})

it('asks in the language of the page', async () => {
  const { wrapper } = await shellWithVehicle()
  setLanguage('de')
  await runReboot(wrapper)

  expect(wrapper.get('#confirm-hold').text()).toBe('Zum Neustart halten')
  await wrapper.get('#confirm-cancel').trigger('keydown', { key: 'Escape' })
})
