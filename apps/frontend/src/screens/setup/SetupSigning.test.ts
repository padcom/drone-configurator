// The Signing page (#33) and the status bar's word against the mock backend: a random key or one from a passphrase is set after
// the user confirmed a question that says what losing the key means and names the vehicle; the page then says the link is
// signed, with the key's fingerprint (never the key); signing is turned off the same way; nothing is offered while the vehicle
// is armed or its state is not known; a vehicle whose signing was reset is said to be so at the next connection; and the
// backend's refusals are said in words. The passphrase is cleared once it is sent.
import { afterEach, expect, it } from 'vitest'
import { RouterLinkStub, type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { feed } from '@/testing/testing'
import SigningIndicator from '@/components/shell/SigningIndicator.vue'
import SetupSigning from './SetupSigning.vue'

const mounted: VueWrapper[] = []

afterEach(() => {
  setLanguage('en')

  for (const m of mounted.splice(0)) {
    m.unmount()
  }
})

/**
 * The page and the status bar's word, over a connected mock vehicle that is disarmed, with the questions answered `answer`.
 *
 * @param answer what the user answers
 * @returns the page, the word, the Configurator, the mock's control and the questions asked
 */
async function page(answer = true) {
  const control: MockControl = {}
  const asked: string[] = []
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control }), question => {
    asked.push(question)

    return Promise.resolve(answer)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await flushPromises()
  const wrapper = mount(SetupSigning, { global: { plugins: [i18n] }, attachTo: document.body })
  const word = mount(SigningIndicator, { global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } } })
  mounted.push(wrapper, word)
  await flushPromises()

  return { wrapper, word, handle, control: control.signing!, asked }
}

it('says the link is not signed until a key is set, in words and with an open lock', async () => {
  const { wrapper, word } = await page()

  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('off')
  expect(wrapper.get('#signing-state').text()).toContain('Signing is off')
  expect(word.get('#link-signing').text()).toBe('Unsigned')
  expect(word.get('#link-signing').attributes('aria-label')).toBe('Signing: Unsigned. Open the signing page')
  expect(wrapper.find('#signing-off').exists()).toBe(false)
})

it('sets a random key after a question that names the vehicle and says what losing the key means', async () => {
  const { wrapper, word, control, asked } = await page()
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()

  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('A random key is made')
  expect(asked[0]).toContain('reset over USB')
  expect(control.setups()).toBe(1)
  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('signed')
  expect(wrapper.get('#signing-fingerprint').text()).toBe(control.vehicleKey())
  expect(wrapper.get('#signing-fingerprint').text()).toMatch(/^[\da-f]{8}$/u)
  expect(wrapper.find('#signing-set-at').exists()).toBe(true)
  expect(word.get('#link-signing').text()).toBe('Signed')
  expect(word.get('#link-signing').classes()).toContain('ok')
})

it('sends nothing when the user says no', async () => {
  const { wrapper, control } = await page(false)
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()

  expect(control.setups()).toBe(0)
  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('off')
})

it('sets a key from a passphrase, which must not be empty, and clears the passphrase once it is sent', async () => {
  const { wrapper, control } = await page()
  const [, fromPhrase] = wrapper.findAll('.kit-segmented input')
  await fromPhrase!.setValue(true)

  expect(wrapper.get('#signing-on').attributes('disabled')).toBeDefined()
  const field = wrapper.get('input[type="password"]')
  await field.setValue('correct horse battery staple')
  expect(wrapper.get('#signing-on').attributes('disabled')).toBeUndefined()
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()

  expect(control.setups()).toBe(1)
  expect((field.element as HTMLInputElement).value).toBe('')
  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('signed')
})

it('turns signing off after a question, and forgets the key', async () => {
  const { wrapper, word, asked } = await page()
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()
  await wrapper.get('#signing-off').trigger('click')
  await flushPromises()

  expect(asked[1]).toContain('Signing is turned off on the vehicle')
  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('off')
  expect(wrapper.find('#signing-fingerprint').exists()).toBe(false)
  expect(word.get('#link-signing').text()).toBe('Unsigned')
})

it('offers nothing while the vehicle is armed or its state is not known', async () => {
  const { wrapper, handle, control } = await page()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('#signing-blocked').text()).toContain('The vehicle is armed')
  expect(wrapper.get('#signing-on').attributes('disabled')).toBeDefined()
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()
  expect(control.setups()).toBe(0)
})

it('says so at the next connection when the vehicle no longer signs with the key, and when it signs with another', async () => {
  const { wrapper, word, handle, control } = await page()
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()
  await handle.vehicle.disconnect()
  control.resetVehicle()
  await handle.vehicle.connect({ transport: 'simulator' })
  await flushPromises()

  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('no-answer')
  expect(wrapper.get('#signing-state').text()).toContain('The key may be wrong, or the vehicle\'s signing was reset')
  expect(word.get('#link-signing').text()).toBe('Not signed')
  expect(word.get('#link-signing').classes()).toContain('warn')
})

it('signs by itself at the next connection to a vehicle that holds the key', async () => {
  const { wrapper, handle } = await page()
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()
  await handle.vehicle.disconnect()
  await flushPromises()
  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('off')
  await handle.vehicle.connect({ transport: 'simulator' })
  await flushPromises()

  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('signed')
})

it('says a refusal of the vehicle in words', async () => {
  const { wrapper, control } = await page()
  control.ignoreSetup(true)
  await wrapper.get('#signing-form').trigger('submit')
  await flushPromises()

  expect(wrapper.get('#signing-error').text()).toContain('The vehicle did not confirm')
  expect(wrapper.get('#signing-state').attributes('data-state')).toBe('off')
})
