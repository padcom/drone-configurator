// The layout rule of the Setup pages: a page is a middle column (the only part that scrolls) and a side panel, side by side in
// the page's own box, so that the style can keep the panel where it is while the column scrolls (the pages' own check of the
// scrolling is the end to end spec layout.e2e.ts, which needs a real window). The Accelerometer page has its panel too: what the
// calibration changes, read only, and where the calibration is.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator, useConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupAccel from './SetupAccel.vue'
import SetupHome from './SetupHome.vue'
import SetupModes from './SetupModes.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/**
 * A page over a connected vehicle.
 *
 * @param page the page
 * @returns the page's wrapper
 */
async function shown(page: ReturnType<typeof defineComponent>): Promise<VueWrapper> {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS }), () => Promise.resolve(true))
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(page) }), { global: { plugins: [i18n, router] } })
  await flushPromises()

  return mounted
}

it.each([
  ['the home', SetupHome],
  ['the accelerometer', SetupAccel],
  ['the flight modes', SetupModes],
])('has %s as a middle column and a side panel, side by side in the box of the page', async (_name, page) => {
  const wrapper = await shown(page)

  const box = wrapper.get('.setup-page-body')
  expect(box.find(':scope > .setup-main').exists()).toBe(true)
  expect(box.find(':scope > aside').exists()).toBe(true)
  expect(box.classes()).not.toContain('single')
})

it('has the side panel of a page that writes as a pane: what it writes and Write fixed below, status in the body', async () => {
  const wrapper = await shown(SetupModes)
  const side = wrapper.get('.setup-page-body > aside')

  expect(side.classes()).toContain('pane')
  expect(side.find('.pane-bottom .setup-writes').exists()).toBe(true)
  expect(side.find('.pane-bottom #setup-modes-write').exists()).toBe(true)
  expect(side.find('.pane-bottom #setup-modes-revert').exists()).toBe(true)
  expect(side.find('.pane-body #setup-modes-status').exists()).toBe(true)
  // (nothing blocks a write here: no top)
  expect(side.find('.pane-top').exists()).toBe(false)
})

it('says at the top of the side panel why nothing can be written, and has no top otherwise', async () => {
  const wrapper = await shown(SetupModes)
  const handle = useConfigurator()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('.setup-page-body > aside .pane-top #setup-modes-blocked').text().length).toBeGreaterThan(0)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await flushPromises()

  expect(wrapper.find('.setup-page-body > aside .pane-top').exists()).toBe(false)
})

it('lists, beside the accelerometer, what its calibration changes and the trim that "Level only" sets', async () => {
  const wrapper = await shown(SetupAccel)

  const side = wrapper.get('.setup-page-body > aside').text()
  for (const id of ['INS_ACCOFFS_X', 'INS_ACCOFFS_Z', 'INS_ACCSCAL_Y', 'AHRS_TRIM_X', 'AHRS_TRIM_Y']) {
    expect(side).toContain(id)
  }
  expect(side).toContain('Written by the vehicle')
  expect(side).toContain('IMU 1')
  expect(side).toContain('INS_TRIM_OPTION')
  // each name is said once on the page (the values, after a success, are in the same list)
  expect(wrapper.text().split('INS_ACCOFFS_X')).toHaveLength(2)
  expect(wrapper.find('.setup-page-body > aside #setup-accel-status').exists()).toBe(true)
  expect(wrapper.find('.setup-page-body > aside button').exists()).toBe(false)
})
