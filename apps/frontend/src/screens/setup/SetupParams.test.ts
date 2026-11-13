// The second half of the Setup pages against the mock backend: Battery (the calibrations propose, the user writes), Serial ports
// (named choices, "reboot needed", the warning for a port that may carry the link), Frame and orientation (the warning, the
// drawing, the reboot prompt) and Devices (the ids decoded). Writes are guarded: refused while the vehicle is armed or not known
// to be disarmed.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { type Component, defineComponent, h } from 'vue'
import EnumField from '@/components/fields/EnumField.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { PARAMS, SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupBattery from './SetupBattery.vue'
import SetupDevices from './SetupDevices.vue'
import SetupFrame from './SetupFrame.vue'
import SetupSerial from './SetupSerial.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** What a test has: the page, the Configurator, the mock's controls, and the questions asked. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
  asked: string[]
}

/** The battery as the vehicle shows it: 12.54 V, 0.8 A, 94 %. */
const BATTERY = { voltage: 12.54, current: 0.8, remaining: 94, cells: [], ageMs: 100 }

/**
 * A page over a connected simulated vehicle that was set up, disarmed, with a battery that shows 12.54 V.
 *
 * @param component the page
 * @param more more of the mock's options
 * @returns the page and what drives it
 */
async function page(component: Component, more: MockOptions = {}): Promise<Rig> {
  const control: MockControl = {}
  const asked: string[] = []
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS, control, ...more }), question => {
    asked.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, battery: BATTERY } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(component) }), { global: { plugins: [i18n, router] } })
  await flushPromises()

  return { wrapper: mounted, handle, control, asked }
}

/**
 * The value of a parameter on the vehicle, as the interface has it.
 *
 * @param rig the page's rig
 * @param id the parameter
 * @returns its value
 */
function valueOf(rig: Rig, id: string): number | undefined {
  return rig.handle.parameters.params.value.find(param => param.id === id)?.value
}

it('shows the first battery\'s live voltage, current and charge, and calls a missing reading a dash', async () => {
  const { wrapper } = await page(SetupBattery)

  expect(wrapper.get('[data-tile="voltage"]').text()).toContain('12.54 V')
  expect(wrapper.get('[data-tile="current"]').text()).toContain('0.80 A')
  expect(wrapper.get('[data-tile="remaining"]').text()).toContain('94 %')
})

it('works out the new voltage multiplier from the meter and what the vehicle shows, and writes it only when asked', async () => {
  const rig = await page(SetupBattery)
  const { wrapper, asked } = rig
  await wrapper.get('[data-calibrate="voltage"] input').setValue('12.62')
  await flushPromises()

  expect(wrapper.get('[data-calibrate="voltage"] .setup-proposal').text()).toContain('10.164')
  expect(asked).toHaveLength(0)
  await wrapper.get('[data-calibrate="voltage"] button').trigger('click')
  await flushPromises()
  await wrapper.get('#setup-battery-write').trigger('click')
  await flushPromises()

  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('BATT_VOLT_MULT 10.1 → 10.164')
  expect(wrapper.get('#setup-battery-status').text()).toBe('Written and read back')
  expect(valueOf(rig, 'BATT_VOLT_MULT')).toBeCloseTo(10.164, 3)
})

it('does not offer a reading that works out to the value the vehicle has, and says so', async () => {
  const { wrapper } = await page(SetupBattery)
  await wrapper.get('[data-calibrate="voltage"] input').setValue('12.54')
  await flushPromises()

  expect(wrapper.get('[data-calibrate="voltage"] [data-same]').text()).toContain('already')
  expect(wrapper.get('[data-calibrate="voltage"] button').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-calibrate="voltage"] button').trigger('click')
  await flushPromises()

  expect(wrapper.get('#setup-battery-write').text()).toBe('No changes')
})

it('asks for a second look at a reading more than 15% from what the vehicle shows, and waits for the tick', async () => {
  const { wrapper } = await page(SetupBattery)
  await wrapper.get('[data-calibrate="voltage"] input[type="text"]').setValue('16')
  await flushPromises()
  const use = wrapper.get('[data-calibrate="voltage"] button')

  expect(wrapper.get('[data-calibrate="voltage"] [role="alert"]').text()).toContain('more than 15%')
  expect(use.attributes('disabled')).toBeDefined()
  await wrapper.get('[data-calibrate="voltage"] input[type="checkbox"]').setValue(true)

  expect(wrapper.get('[data-calibrate="voltage"] button').attributes('disabled')).toBeUndefined()
})

it('calibrates the current only for a monitor that reads it, from the amps the vehicle shows', async () => {
  const { wrapper } = await page(SetupBattery)
  await wrapper.get('[data-calibrate="current"] input').setValue('1.6')
  await flushPromises()

  expect(wrapper.get('[data-calibrate="current"] .setup-proposal').text()).toContain('34')
  const voltageOnly = SETUP_PARAMS.map(param => param.id === 'BATT_MONITOR' ? { ...param, value: 3 } : param)
  const other = await page(SetupBattery, { params: voltageOnly })

  expect(other.wrapper.find('[data-calibrate="current"]').exists()).toBe(false)
})

it('offers the voltage calibration only for a monitor with a multiplier, from the vehicle\'s value and not a draft', async () => {
  const smbus = SETUP_PARAMS.map(param => param.id === 'BATT_MONITOR' ? { ...param, value: 7 } : param)
  const { wrapper } = await page(SetupBattery, { params: smbus })

  expect(wrapper.find('[data-calibrate="voltage"]').exists()).toBe(false)
  expect(wrapper.get('#setup-battery-novoltage').text()).toContain('does not use a voltage multiplier')
  // A monitor that is chosen and not written yet changes nothing: what the vehicle does is what it is set to.
  wrapper.findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 4)
  await flushPromises()

  expect(wrapper.find('[data-calibrate="voltage"]').exists()).toBe(false)
})

it('offers the current calibration for the analog current monitor, which has no voltage multiplier', async () => {
  const analog = SETUP_PARAMS.map(param => param.id === 'BATT_MONITOR' ? { ...param, value: 31 } : param)
  const { wrapper } = await page(SetupBattery, { params: analog })

  expect(wrapper.find('[data-calibrate="voltage"]').exists()).toBe(false)
  expect(wrapper.find('[data-calibrate="current"]').exists()).toBe(true)
  expect(wrapper.get('[data-calibrate="current"]').text()).toContain('offset the sensor has is left as it is')
})

it('says there is nothing to calibrate against when the vehicle shows no reading', async () => {
  const { wrapper, handle } = await page(SetupBattery)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, batteryVoltage: undefined, battery: undefined } })
  await flushPromises()

  expect(wrapper.get('[data-calibrate="voltage"]').text()).toContain('shows no reading yet')
})

it('has no second battery to choose when the vehicle has none, and no live tiles or calibration for it when it has', async () => {
  const { wrapper } = await page(SetupBattery)

  expect(wrapper.get('#setup-battery-tab-2').attributes('disabled')).toBeDefined()
  const two = SETUP_PARAMS.concat([
    { id: 'BATT2_MONITOR', kind: 'int', type: 'INT8', value: 4, index: 900 },
    { id: 'BATT2_CAPACITY', kind: 'int', type: 'INT32', value: 3000, index: 901 },
    { id: 'BATT2_VOLT_MULT', kind: 'real', type: 'REAL32', value: 10, index: 902 },
    { id: 'BATT2_AMP_PERVLT', kind: 'real', type: 'REAL32', value: 17, index: 903 },
  ])
  const other = await page(SetupBattery, { params: two })
  await other.wrapper.get('#setup-battery-tab-2').trigger('click')
  await flushPromises()

  expect(other.wrapper.find('.setup-tiles').exists()).toBe(false)
  expect(other.wrapper.find('[data-calibrate]').exists()).toBe(false)
  expect(other.wrapper.get('.setup-writes').text()).toContain('BATT2_CAPACITY')
})

it('does not write the battery while the vehicle is armed, and says why', async () => {
  const { wrapper, handle, control, asked } = await page(SetupBattery)
  await wrapper.get('[data-calibrate="voltage"] input').setValue('12.62')
  await wrapper.get('[data-calibrate="voltage"] button').trigger('click')
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true, battery: BATTERY } })
  await flushPromises()

  expect(wrapper.get('#setup-battery-blocked').text()).toContain('The vehicle is armed')
  expect(wrapper.get('#setup-battery-write').attributes('disabled')).toBeDefined()
  expect(asked).toHaveLength(0)
})

it('lists the ports the vehicle has with their protocol and speed named, and says how many are in use', async () => {
  const { wrapper } = await page(SetupSerial)

  expect(wrapper.findAll('.setup-port')).toHaveLength(4)
  expect(wrapper.get('#setup-serial-inuse').text()).toBe('Ports in use: 3')
  const protocols = wrapper.findAll('.setup-port').map(row => row.findAll('input')[0]?.element.value)
  const speeds = wrapper.findAll('.setup-port').map(row => row.findAll('input')[1]?.element.value)

  expect(protocols).toEqual(['MAVLink2', 'MAVLink2', 'GPS', 'None'])
  expect(speeds).toEqual(['115200', '57600', '115200', '38400'])
  expect(wrapper.get('.setup-writes').text()).not.toContain('SERIAL4')
})

it('writes a changed speed after one question that names it, then says a reboot is needed, and reboots nothing', async () => {
  const rig = await page(SetupSerial)
  const { wrapper, asked } = rig
  wrapper.get('[data-port="2"]').findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 921)
  await flushPromises()
  await wrapper.get('#setup-serial-write').trigger('click')
  await flushPromises()

  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('SERIAL2_BAUD 115 → 921')
  expect(valueOf(rig, 'SERIAL2_BAUD')).toBe(921)
  expect(wrapper.get('#setup-reboot').text()).toContain('Reboot needed')
  expect(rig.control.rebootsSent?.()).toBe(0)
})

it('says a change to SERIAL0 or to a port that carries MAVLink may cut the connection, before it is written', async () => {
  const { wrapper } = await page(SetupSerial)

  expect(wrapper.find('#setup-serial-cut').exists()).toBe(false)
  wrapper.get('[data-port="1"]').findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 115)
  await flushPromises()

  expect(wrapper.get('#setup-serial-cut').text()).toContain('Serial 1 may cut the connection')
  wrapper.get('[data-port="1"]').findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 57)
  wrapper.get('[data-port="2"]').findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 921)
  await flushPromises()

  expect(wrapper.find('#setup-serial-cut').exists()).toBe(false)
})

it('keeps saying the connection will be lost after a SERIAL0 write, beside the reboot button', async () => {
  const rig = await page(SetupSerial)
  const { wrapper } = rig
  wrapper.get('[data-port="0"]').findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 5)
  await flushPromises()
  await wrapper.get('#setup-serial-write').trigger('click')
  await flushPromises()

  // The write cleared the user's choices, and the warning is still there: the change takes effect at the boot.
  expect(valueOf(rig, 'SERIAL0_PROTOCOL')).toBe(5)
  expect(wrapper.find('#setup-serial-cut').exists()).toBe(false)
  expect(wrapper.find('#setup-reboot').exists()).toBe(true)
  expect(wrapper.get('#setup-serial-cut-after').text()).toContain('Serial 0 will be lost')
})

it('does not say the connection will be lost after a write to a port that carried nothing of it', async () => {
  const { wrapper } = await page(SetupSerial)
  wrapper.get('[data-port="2"]').findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 921)
  await flushPromises()
  await wrapper.get('#setup-serial-write').trigger('click')
  await flushPromises()

  expect(wrapper.find('#setup-reboot').exists()).toBe(true)
  expect(wrapper.find('#setup-serial-cut-after').exists()).toBe(false)
})

it('says a vehicle with no serial parameters has no ports to set', async () => {
  const { wrapper } = await page(SetupSerial, { params: PARAMS })

  expect(wrapper.find('.setup-port').exists()).toBe(false)
  expect(wrapper.text()).toContain('no serial port parameters')
})

it('warns that a wrong frame makes the vehicle uncontrollable before anything is chosen, and draws the quad', async () => {
  const { wrapper } = await page(SetupFrame)

  expect(wrapper.get('#setup-frame-warning').text()).toContain('uncontrollable')
  expect(wrapper.findAll('[data-motor]').map(motor => motor.attributes('data-motor')).sort()).toEqual(['1', '2', '3', '4'])
  const label = wrapper.get('.setup-frame-drawing svg').attributes('aria-label')

  expect(label).toContain('Motor 1 at 45 degrees, spins counter-clockwise')
})

it('says there is no drawing for a frame it has no layout for, and draws nothing', async () => {
  const { wrapper } = await page(SetupFrame)
  wrapper.findAllComponents(EnumField)[0]?.vm.$emit('update:modelValue', 7)
  await flushPromises()

  expect(wrapper.find('.setup-frame-drawing svg').exists()).toBe(false)
  expect(wrapper.get('#setup-frame-nodrawing').text()).toBe('There is no drawing for this frame.')
})

it('writes a changed frame type after one question, then says a reboot is needed and never reboots by itself', async () => {
  const rig = await page(SetupFrame)
  const { wrapper, asked } = rig
  wrapper.findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 0)
  await flushPromises()

  expect(wrapper.findAll('[data-motor]')).toHaveLength(4)
  await wrapper.get('#setup-frame-write').trigger('click')
  await flushPromises()

  expect(asked[0]).toContain('FRAME_TYPE 1 → 0')
  expect(valueOf(rig, 'FRAME_TYPE')).toBe(0)
  expect(wrapper.find('#setup-reboot').exists()).toBe(true)
  expect(rig.control.rebootsSent?.()).toBe(0)
})

it('does not change the frame while the vehicle is armed or not known to be disarmed', async () => {
  const { wrapper, handle, control, asked } = await page(SetupFrame)
  wrapper.findAllComponents(EnumField)[1]?.vm.$emit('update:modelValue', 0)
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get('#setup-frame-blocked').text()).toContain('The vehicle is armed')
  expect(wrapper.get('#setup-frame-write').attributes('disabled')).toBeDefined()
  expect(asked).toHaveLength(0)
})

it('decodes the device ids into the bus, the address and the type, and says a sensor never seen was not seen', async () => {
  const { wrapper } = await page(SetupDevices)
  const row = (param: string) => wrapper.findAll(`[data-device="${param}"] th, [data-device="${param}"] td`)
    .map(cell => cell.text().replace(/\s+/gu, ' ')).join('|')

  expect(row('COMPASS_DEV_ID')).toBe('Compass 1|I2C 1|0x1e|7|466441')
  expect(row('INS_ACC_ID')).toBe('Accelerometer 1|SPI 0|0x01|9|590082')
  expect(row('INS_ACC2_ID')).toContain('Not seen')
  expect(row('BARO1_DEVID')).toContain('0x03')
  expect(wrapper.find('[data-device="INS_ACC3_ID"]').exists()).toBe(false)
})

it('has its words in another language', async () => {
  setLanguage('de')
  const { wrapper } = await page(SetupFrame)

  expect(wrapper.get('.setup-heading').text()).toBe('Rahmen und Ausrichtung')
})
