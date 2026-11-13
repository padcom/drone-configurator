// The Setup screen and its pages against the mock backend: the shell (no vehicle, another kind of vehicle), the home (what the
// parameters say, and what was checked), Flight modes and Failsafes (named choices, the warnings, the guarded write that is
// refused while the vehicle is armed or not known to be disarmed, the one question, the read back), and Vehicle information.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { RouterView, createMemoryHistory } from 'vue-router'
import { type Component, defineComponent, h } from 'vue'
import EnumField from '@/components/fields/EnumField.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { PARAMS, SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import Setup from '../Setup.vue'
import SetupFailsafes from './SetupFailsafes.vue'
import SetupHome from './SetupHome.vue'
import SetupInfo from './SetupInfo.vue'
import SetupModes from './SetupModes.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** What a test has: the page, the Configurator, and the mock's controls. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
  asked: string[]
}

/**
 * Connects the simulated vehicle, says it is disarmed, and waits for its parameters.
 *
 * @param handle the Configurator
 * @param connect whether to connect at all
 */
async function connectIf(handle: ReturnType<typeof createConfigurator>, connect: boolean): Promise<void> {
  if (!connect) {
    return
  }
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
}

/**
 * Mounts a page under the router at the Setup home. The screen is what the router shows at its own depth, so it is mounted by
 * the router's view, as the shell does.
 *
 * @param component the page
 * @returns the mounted page
 */
async function mountPage(component: Component): Promise<VueWrapper> {
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  const shown = component === Setup ? defineComponent({ render: () => h(RouterView) }) : component
  const wrapper = mount(shown, { global: { plugins: [i18n, router] }, props: { section: 'home' } })
  await flushPromises()

  return wrapper
}

/**
 * A page over a connected simulated vehicle (a Copter that was set up unless told otherwise), disarmed, its parameters read.
 *
 * @param component the page
 * @param more more of the mock's options
 * @param connect whether to connect the vehicle
 * @returns the page and what drives it
 */
async function page(component: Component, more: MockOptions = {}, connect = true): Promise<Rig> {
  const control: MockControl = {}
  const asked: string[] = []
  const handle = createConfigurator(
    mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS, control, ...more }),
    question => {
      asked.push(question)

      return Promise.resolve(true)
    },
  )
  control.armed?.(false)
  await connectIf(handle, connect)
  mounted = await mountPage(component)

  return { wrapper: mounted, handle, control, asked }
}

it('says a vehicle must be connected, with no list of pages, when none is', async () => {
  const { wrapper } = await page(Setup, {}, false)

  expect(wrapper.get('.kit-empty .title').text()).toBe('No vehicle is connected')
  expect(wrapper.find('.setup-nav').exists()).toBe(false)
})

it('says Setup is not available yet for a vehicle that is not a multicopter, and offers no page', async () => {
  const { wrapper, control } = await page(Setup, {}, false)
  control.connection?.({ state: 'connected', vehicle: { sysid: 1, compid: 1, type: 'FIXED_WING', autopilot: 'ARDUPILOTMEGA' } })
  await flushPromises()

  expect(wrapper.get('.kit-empty .title').text()).toBe('Setup is not available yet for this kind of vehicle')
  expect(wrapper.get('.kit-empty .help').text()).toContain('FIXED_WING')
  expect(wrapper.find('.setup-nav').exists()).toBe(false)
})

it('lists the pages in the groups of the design, and marks the steps by what the parameters say, in words as well', async () => {
  const { wrapper } = await page(Setup)
  const links = wrapper.findAll('.setup-nav a').map(link => link.text().replace(/\s+/gu, ' ').trim())

  expect(links[0]).toBe('Overview')
  expect(links).toContain('Flight modes✓Looks set up')
  expect(links).toContain('Motors and ESCs–Cannot be told from the parameters')
  expect(links).toContain('Vehicle information')
})

it('shows how many steps look set up, a card for each with what was checked, and never says verified', async () => {
  const { wrapper } = await page(SetupHome)

  expect(wrapper.get('#setup-progress').text()).toBe('7 of 7 steps look set up')
  const cards = wrapper.findAll('.setup-card')
  expect(cards).toHaveLength(8)
  expect(cards.every(card => card.find('.setup-card-checked').text() !== '')).toBe(true)
  expect(wrapper.text()).not.toMatch(/verified|calibrated/iu)
  expect(wrapper.get('#setup-next').text()).toContain('Every step that can be read')
  expect(wrapper.get('.setup-facts').text()).toContain('QUADROTOR')
})

it('points to the first step that is open, with its page, when the parameters are at the defaults', async () => {
  const fresh = SETUP_PARAMS.map(param => param.id === 'COMPASS_OFS_X' ? { ...param, value: 0 } : param)
    .map(param => ['COMPASS_OFS_Y', 'COMPASS_OFS_Z'].includes(param.id) ? { ...param, value: 0 } : param)
  const { wrapper } = await page(SetupHome, { params: fresh })

  expect(wrapper.get('#setup-progress').text()).toBe('6 of 7 steps look set up')
  expect(wrapper.get('#setup-next').text()).toContain('Compass')
  expect(wrapper.get('#setup-next').attributes('href')).toContain('/setup/compass')
  expect(wrapper.get('.setup-card.open').text()).toContain('COMPASS_OFS are all zero')
})

it('has no verdict for steps whose parameters are not on the vehicle: they are not told, and none is required', async () => {
  const { wrapper } = await page(SetupHome, { params: PARAMS })

  expect(wrapper.findAll('.setup-card.unknown')).toHaveLength(8)
  expect(wrapper.get('#setup-progress').text()).toBe('0 of 0 steps look set up')
  expect(wrapper.find('.setup-card.open').exists()).toBe(false)
})

it('names the modes of the vehicle in the six slots, with the line of help for each, and no live position', async () => {
  const { wrapper } = await page(SetupModes)
  const fields = wrapper.findAllComponents(EnumField)

  expect(fields).toHaveLength(6)
  expect(wrapper.findAll('.setup-slot-hint').map(hint => hint.text())).toEqual([
    'Pilot levels, pilot holds position',
    'Holds position and altitude',
    'Flies home and lands',
    'Flies the mission',
    'Lands where it is',
    'Holds position, direct stick feel',
  ])
  expect(wrapper.findAll('.setup-slot-range').map(range => range.text()))
    .toEqual([
      'up to 1230', '1231–1360', '1361–1490', '1491–1620', '1621–1749', '1750 and up',
    ])
  expect(wrapper.text()).toContain('The position the switch is in now is not shown here yet.')
  expect(wrapper.find('#setup-no-escape').exists()).toBe(false)
})

it('lists exactly what the modes page writes, and writes a changed slot after one question, read back', async () => {
  const { wrapper, handle, asked } = await page(SetupModes)
  wrapper.findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 9)
  await flushPromises()

  expect(wrapper.get('.setup-writes').text()).toBe('FLTMODE1FLTMODE2FLTMODE3FLTMODE4FLTMODE5FLTMODE6FLTMODE_CH')
  await wrapper.get('#setup-modes-write').trigger('click')
  await flushPromises()

  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('FLTMODE2 5 → 9')
  expect(asked[0]).not.toContain('FLTMODE1')
  expect(wrapper.get('#setup-modes-status').text()).toBe('Written and read back')
  expect(handle.parameters.params.value.find(param => param.id === 'FLTMODE2')?.value).toBe(9)
})

it('chooses the channel of the mode switch from a list: None, then the channels ArduPilot lists, by number', async () => {
  const { wrapper, asked } = await page(SetupModes)
  const channel = wrapper.get<HTMLSelectElement>('select')

  const offered = channel.findAll('option').map(option => `${option.attributes('value')} ${option.text()}`)
  expect(offered.join(', ')).toBe('0 None, 5 Channel 5, 6 Channel 6, 7 Channel 7, 8 Channel 8, 9 Channel 9, 10 Channel 10, '
    + '11 Channel 11, 12 Channel 12, 13 Channel 13, 14 Channel 14, 15 Channel 15')
  expect(channel.element.value).toBe('5')
  await channel.setValue('8')
  await flushPromises()
  await wrapper.get('#setup-modes-write').trigger('click')
  await flushPromises()

  expect(asked[0]).toContain('FLTMODE_CH 5 → 8')
})

it('shows a channel the vehicle has that the list does not hold, as the number it is', async () => {
  const odd = SETUP_PARAMS.map(param => param.id === 'FLTMODE_CH' ? { ...param, value: 2 } : param)
  const { wrapper } = await page(SetupModes, { params: odd })

  expect(wrapper.get<HTMLSelectElement>('select').element.value).toBe('2')
  expect(wrapper.get('select option[value="2"]').text()).toBe('2')
})

it('warns when no slot can bring the vehicle home or down, and writes nothing until asked', async () => {
  const { wrapper, asked } = await page(SetupModes)
  for (const slot of [2, 4]) {
    wrapper.findAllComponents(EnumField)[slot]?.vm.$emit('update:modelValue', 5)
  }
  await flushPromises()

  expect(wrapper.get('#setup-no-escape').text()).toContain('Assign RTL, Land or SmartRTL')
  expect(asked).toHaveLength(0)
})

it('does not write while the vehicle is armed: it says why, turns the button off, and sends nothing', async () => {
  const { wrapper, handle, control, asked } = await page(SetupModes)
  wrapper.findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 5)
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('#setup-modes-blocked').text()).toContain('The vehicle is armed')
  expect(wrapper.get('#setup-modes-write').attributes('disabled')).toBeDefined()
  await wrapper.get('#setup-modes-write').trigger('click')
  expect(asked).toHaveLength(0)
  expect(handle.parameters.params.value.find(param => param.id === 'FLTMODE1')?.value).toBe(0)
})

it('does not write while it is not known that the vehicle is disarmed (no recent heartbeat), and says that', async () => {
  const { wrapper, handle } = await page(SetupModes)
  wrapper.findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 5)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 9000 } })
  await flushPromises()

  expect(wrapper.get('#setup-modes-blocked').text()).toContain('not known whether the vehicle is disarmed')
  expect(wrapper.get('#setup-modes-write').attributes('disabled')).toBeDefined()
})

it('puts back what the vehicle has when asked, and the button says there is nothing to write', async () => {
  const { wrapper } = await page(SetupModes)
  wrapper.findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 5)
  await flushPromises()
  expect(wrapper.get('#setup-modes-write').text()).toBe('Write and verify')
  await wrapper.get('#setup-modes-revert').trigger('click')
  await flushPromises()

  expect(wrapper.get('#setup-modes-write').text()).toBe('No changes')
  expect(wrapper.findAllComponents(EnumField)[0]?.props('modelValue')).toBe(0)
})

it('says what each failsafe does in words, and warns for the one that is off', async () => {
  const { wrapper } = await page(SetupFailsafes)
  const rows = wrapper.findAll('.setup-failsafe')

  expect(rows).toHaveLength(5)
  expect(rows[0]?.get('.setup-say').text()).toBe('If the voltage stays low, it flies home and lands.')
  expect(rows[2]?.get('.setup-say').text()).toBe('If the transmitter signal stops, it flies home and lands.')
  const gcs = wrapper.get('[data-failsafe="gcs"]')
  expect(gcs.get('.setup-say').text())
    .toBe('If the ground station is lost for 5 s, the failsafe is off: the vehicle does not react.')
  expect(gcs.get('.setup-warn').text()).toContain('is off')
  expect(wrapper.findAll('.setup-warn')).toHaveLength(1)
  expect(wrapper.get('[data-failsafe="batteryLow"]').find('.setup-warn').exists()).toBe(false)
})

it('does not say a failsafe that is disabled warns: for the radio and the ground station 0 is off, nothing warns', async () => {
  const off = SETUP_PARAMS.map(param => param.id === 'FS_THR_ENABLE' ? { ...param, value: 0 } : param)
  const { wrapper } = await page(SetupFailsafes, { params: off })

  for (const kind of ['radio', 'gcs']) {
    const row = wrapper.get(`[data-failsafe="${kind}"]`)

    expect(row.get('.setup-say').text()).toContain('the failsafe is off')
    expect(row.text()).not.toMatch(/warns/u)
  }
})

it('says the EKF failsafe acts only in a mode that needs a position, and warns only for report only', async () => {
  const { wrapper } = await page(SetupFailsafes)
  const say = wrapper.get('[data-failsafe="ekf"] .setup-say').text()

  expect(say).toContain('in a mode that needs a position')
  expect(say).toContain('in Stabilize or AltHold it does nothing')
  wrapper.findAllComponents(EnumField)[4]?.vm.$emit('update:modelValue', 0)
  await flushPromises()

  expect(wrapper.get('[data-failsafe="ekf"] .setup-say').text()).toContain('only warns')
})

it('says a value with no name is the number it is, never a name that was guessed', async () => {
  const odd = SETUP_PARAMS.map(param => param.id === 'FS_THR_ENABLE' ? { ...param, value: 2 } : param)
  const { wrapper } = await page(SetupFailsafes, { params: odd })

  expect(wrapper.get('[data-failsafe="radio"] .setup-say').text()).toBe(
    'If the transmitter signal stops, it does action 2, which has no name here.',
  )
})

it('warns for a failsafe that stops the motors', async () => {
  const { wrapper } = await page(SetupFailsafes)
  wrapper.findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 5)
  await flushPromises()

  const warning = wrapper.get('[data-failsafe="batteryLow"] .setup-warn')

  expect(warning.text()).toContain('stops the motors in the air')
})

it('refuses a critical voltage that is not below the low one, and writes nothing then', async () => {
  const { wrapper, asked } = await page(SetupFailsafes)
  const input = wrapper.get('[data-failsafe="batteryCritical"] .setup-threshold input')
  await input.setValue('11')
  await flushPromises()

  expect(wrapper.get('#setup-order').text()).toContain('Critical voltage must be below'.replace('Critical', 'The critical'))
  expect(wrapper.get('#setup-failsafes-write').attributes('disabled')).toBeDefined()
  expect(asked).toHaveLength(0)
})

it('writes the changed failsafes after one question that names every parameter, and reads each back', async () => {
  const { wrapper, handle, asked } = await page(SetupFailsafes)
  wrapper.findAllComponents(EnumField)[2]?.vm.$emit('update:modelValue', 3)
  wrapper.findAllComponents(EnumField)[3]?.vm.$emit('update:modelValue', 1)
  await flushPromises()
  await wrapper.get('#setup-failsafes-write').trigger('click')
  await flushPromises()

  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('FS_THR_ENABLE 1 → 3')
  expect(asked[0]).toContain('FS_GCS_ENABLE 0 → 1')
  expect(wrapper.get('#setup-failsafes-status').text()).toBe('Written and read back')
  expect(handle.parameters.params.value.find(param => param.id === 'FS_GCS_ENABLE')?.value).toBe(1)
})

it('shows the board and the sensors the vehicle reports, and the ones that are not healthy as such', async () => {
  const { wrapper } = await page(SetupInfo)
  const text = wrapper.get('.setup-facts-list').text()

  expect(text).toContain('Firmware version')
  expect(text).toContain('4.6.2')
  expect(text).toContain('official release')
  expect(text).toContain('a1b2c3d4')
  expect(text).toContain('0xf4240')
  expect(wrapper.findAll('.setup-sensors tbody tr')).toHaveLength(5)
  expect(wrapper.get('[data-sensor="mag"] td.bad').text()).toBe('No')
  expect(wrapper.get('[data-sensor="gyro"]').text()).toContain('Gyroscope')
})

it('has its words in another language', async () => {
  setLanguage('de')
  const { wrapper } = await page(SetupFailsafes)

  // The list beside the page names it, so no header is shown; the heading stays for a screen reader (hidden).
  const heading = wrapper.get('.setup-page-body h3')
  expect(heading.text()).toBe('Failsafes')
  expect(heading.classes()).toContain('visually-hidden')
  expect(wrapper.get('.setup-page-body').attributes('aria-labelledby')).toBe(heading.attributes('id'))
  expect(wrapper.get('[data-failsafe="batteryLow"] h4').text()).toBe('Akku niedrig')
})
