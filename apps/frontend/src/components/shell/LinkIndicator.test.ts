// The LINK cell of the top bar on the mock backend: the link's quality as the backend measures it (`link.stats`), a weak or poor
// link said with an icon and a word, the details in a popover reached from the keyboard, and a dash without a vehicle.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import TopBar from './TopBar.vue'
import { shallowRef } from 'vue'
import type { Connection, LinkStats } from '@/generated/app'
import { i18n } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { createConfigurator } from '@/composables/useConfigurator'
import { useLinkStats } from '@/composables/useLinkStats'
import { createBackendClient } from '@/backend/client'

/** What a test started: unmounted and disconnected after it, so the mock's 5 ms samples stop before the next file. */
const started: { wrapper: VueWrapper, handle: ReturnType<typeof createConfigurator> }[] = []

afterEach(async () => {
  const done = started.splice(0)
  done.forEach(({ wrapper }) => wrapper.unmount())
  await Promise.all(done.map(({ handle }) => handle.vehicle.disconnect()))
  document.body.innerHTML = ''
})

/** A link that loses a quarter of its packets, with a slow round trip. */
const LOSSY: LinkStats = {
  windowMs: 5000, received: 150, lost: 50, rxRate: 30, txRate: 6, rxBytes: 1140, txBytes: 144, latencyMs: 640, silentMs: 40,
  totalReceived: 900, totalLost: 300,
}

/**
 * Waits for the mock's next samples.
 *
 * @param ms how long
 */
const wait = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * The top bar on the mock backend, which sends the link's stats every 5 ms.
 *
 * @returns the bar, the mock's controls and the configurator
 */
async function bar() {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 5, control }))
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  const wrapper = mount(TopBar, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await flushPromises()
  started.push({ wrapper, handle })

  return { wrapper, control, handle }
}

it('is a dash without a vehicle, and the quality of the link once one is connected', async () => {
  const { wrapper, handle } = await bar()
  expect(wrapper.get('.cell.link dd span[aria-hidden="true"]').text()).toBe('—')

  await handle.vehicle.connect({ transport: 'simulator' })
  await wait(30)

  expect(wrapper.get('#link-quality .link-value').text()).toMatch(/^\d+%$/u)
  expect(wrapper.find('#link-quality .icon').exists()).toBe(false)
})

it('says a lossy link is poor with an icon and a word, and its details in a popover opened from the keyboard', async () => {
  const { wrapper, control, handle } = await bar()
  await handle.vehicle.connect({ transport: 'simulator' })
  control.link?.(LOSSY)
  await wait(30)
  const trigger = wrapper.get('#link-quality .trigger')

  expect(wrapper.get('#link-quality').classes()).toContain('error')
  expect(trigger.text()).toBe('75%poor')
  expect(trigger.find('.icon').exists()).toBe(true)
  expect(trigger.attributes('aria-label')).toBe('Link 75%, poor: show the details')
  // A button: Enter and Space press it, which is a click.
  await trigger.trigger('click')
  const details = new Map(wrapper.findAll('.link-detail').map(line => [line.get('dt').text(), line.get('dd').text()]))

  expect(details.get('Packet loss')).toBe('25.0% (50 of 200 packets)')
  expect(details.get('Latency')).toBe('640 ms')
  expect(wrapper.get('.link-window').text()).toBe('Measured over the last 5.0 s.')
  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })

  expect(document.activeElement).toBe(trigger.element)
})

it('forgets the stats of a link that is no longer up', async () => {
  const transport = mockBackend({ telemetryMs: 5 })
  const handle = createConfigurator(transport)
  await handle.vehicle.connect({ transport: 'simulator' })
  await wait(30)
  expect(handle.link.stats.value?.received).toBeGreaterThan(0)

  await handle.vehicle.disconnect()

  expect(handle.link.stats.value).toBeNull()
})

it('stays empty, and quiet, against a backend that has no link stats', async () => {
  const client = createBackendClient(mockBackend({ telemetryMs: 5 }))
  const refusing = { ...client, subscribe: () => ({ ready: Promise.reject(new Error('UNKNOWN_METHOD')), stop: () => undefined }) }
  const link = useLinkStats({ client: refusing, connection: shallowRef<Connection>({ state: 'connected' }) })

  await link.watch()

  expect(link.stats.value).toBeNull()
})
