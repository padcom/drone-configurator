// The notice under the top bar when the recording of the connection stopped (#30): nothing while it records; a full disk said in
// words, with an icon, with what to do next and that the link carries on; the way to Settings; and gone when it is dismissed.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { createConfigurator } from '@/composables/useConfigurator'
import RecordingNotice from './RecordingNotice.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * The notice, with a vehicle connected through the mock backend.
 *
 * @returns the notice, the mock's controls and the router
 */
async function notice() {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ control }))
  await flushPromises()
  await handle.vehicle.connect({ transport: 'simulator' })
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  mounted = mount(RecordingNotice, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, control, router, handle }
}

it('is in the page but shows nothing while the connection is recorded', async () => {
  const { wrapper, handle } = await notice()

  await vi.waitFor(() => expect(handle.recording.state.value?.key).toBeDefined())
  expect(handle.recording.state.value?.key).toBe('recorded/2026-11-24_10-15-30.tlog')
  expect(wrapper.get('#recording-notice').isVisible()).toBe(false)
  expect(wrapper.find('#dismiss-recording-notice').exists()).toBe(false)
})

it('says the disk is full in words and with an icon, that the link carries on, and what to do', async () => {
  const { wrapper, control, handle } = await notice()
  control.recording?.({ failure: { code: 'disk-full', message: 'No space left on device (os error 28)' } })
  await flushPromises()

  const banner = wrapper.get('#recording-notice')
  expect(banner.isVisible()).toBe(true)
  expect(banner.attributes('role')).toBe('status')
  expect(banner.find('.icon').exists()).toBe(true)
  expect(banner.text()).toContain('Telemetry recording stopped: the disk is full.')
  expect(banner.text()).toContain('The link to the vehicle carries on.')
  expect(banner.text()).toContain('Free some space, or choose another folder in Settings.')
  // the vehicle stays connected
  expect(handle.vehicle.connection.value.state).toBe('connected')
})

it('opens Settings, and goes when it is dismissed', async () => {
  const { wrapper, control, router } = await notice()
  control.recording?.({ failure: { code: 'limit', message: 'the recording reached the limit' } })
  await flushPromises()

  expect(wrapper.get('#recording-notice').text()).toContain('the recording reached the size limit by itself')
  await wrapper.get('#recording-notice-settings').trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings'))
  await wrapper.get('#dismiss-recording-notice').trigger('click')
  await vi.waitFor(() => expect(wrapper.get('#recording-notice').isVisible()).toBe(false))
})
