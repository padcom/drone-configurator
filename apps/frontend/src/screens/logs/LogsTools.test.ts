// "Tools": the logging setup. Names of bits come from the parameter metadata (numbers without it), ticking changes nothing on
// the vehicle, "Add to the queue" puts the changes in the list of parameter changes, nothing is queued or written while the
// vehicle is armed (or may be), and the size is labelled an estimate that says what it rests on.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import type { LocalLog, Param } from '@/generated/app'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { VEHICLE, telemetryAt } from '@/mock/fixtures'
import { createConfigurator } from '@/composables/useConfigurator'
import { feed } from '@/testing/testing'
import LogsTools from './LogsTools.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * A parameter of the vehicle.
 *
 * @param id its name
 * @param value its value
 * @param index its place in the list
 * @returns the parameter
 */
const param = (id: string, value: number, index: number): Param => ({ id, kind: 'int', type: 'INT32', value, index })

const LOGGING_PARAMS: Param[] = [
  param('LOG_BITMASK', 0b101, 0),
  param('INS_LOG_BAT_MASK', 0, 1),
  param('INS_LOG_BAT_OPT', 0, 2),
  param('INS_LOG_BAT_CNT', 1024, 3),
  param('INS_LOG_BAT_LGIN', 20, 4),
  param('RTL_ALT', 1500, 5),
]

/** The telemetry ticks after connecting: 1 is disarmed, 5 is armed. */
const DISARMED = 1
const ARMED = 5

/** What the vehicle has and says, unless a test says otherwise. */
const DEFAULTS: { params: Param[], tick: number | null } = { params: LOGGING_PARAMS, tick: DISARMED }

/**
 * The page on a configurator that holds logging parameters.
 *
 * @param options what the vehicle has and says (the parameters, and the telemetry as ticks after connecting, null for none)
 * @returns the wrapper and the handle
 */
async function page(options: Partial<typeof DEFAULTS> = {}) {
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000 }))
  const { params, tick } = { ...DEFAULTS, ...options }
  // After the backend's first words about the connection (it says it is not connected), which would undo what is fed.
  await flushPromises()
  feed(handle, { params, list: 'complete', connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  feed(handle, { telemetry: tick === null ? null : telemetryAt(tick) })
  mounted = mount(LogsTools, { global: { plugins: [i18n] }, props: { section: 'tools' }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * The checkbox `index` of the fieldset `group` (0 for the streams, 1 for the batch sampling).
 *
 * @param wrapper the page
 * @param group which fieldset
 * @param index which checkbox in it
 * @returns the checkbox
 */
function box(wrapper: VueWrapper, group: number, index: number) {
  return wrapper.get(`fieldset:nth-of-type(${group + 1}) li:nth-child(${index + 1}) input`)
}

/**
 * Whether a checkbox is ticked.
 *
 * @param wrapper the page
 * @param group which fieldset
 * @param index which checkbox in it
 * @returns true if it is
 */
function ticked(wrapper: VueWrapper, group: number, index: number): boolean {
  return (box(wrapper, group, index).element as HTMLInputElement).checked
}

/**
 * The labels of the checkboxes of a group.
 *
 * @param wrapper the page
 * @param group which fieldset
 * @returns the label of each checkbox
 */
function labels(wrapper: VueWrapper, group: number): string[] {
  return wrapper.get(`fieldset:nth-of-type(${group + 1})`).findAll('label').map(label => label.text())
}

it('says what is missing when the vehicle has no logging parameters', async () => {
  const { wrapper } = await page({ params: [param('RTL_ALT', 1500, 0)] })

  expect(wrapper.get('#setup-none').text()).toContain('No logging parameters yet')
  expect(wrapper.find('fieldset').exists()).toBe(false)
})

it('shows the bits as numbers without metadata, and says how to get their names', async () => {
  const { wrapper } = await page()

  expect(labels(wrapper, 0)).toEqual(['Bit 0', 'Bit 2', 'Bit 17', 'Bit 19'])
  expect(wrapper.get('#setup-unnamed').text()).toContain('not loaded')
  expect(wrapper.find('#setup-load-metadata').exists()).toBe(true)
})

it('takes the names of the bits from the metadata, and keeps a bit that is on and has no name', async () => {
  const { wrapper, handle } = await page({ params: [param('LOG_BITMASK', 0b100001, 0), ...LOGGING_PARAMS.slice(1)] })
  handle.metadata.metadata.value = new Map([['LOG_BITMASK', { bits: { 0: 'Fast Attitude', 2: 'GPS' } }]])
  await flushPromises()

  expect(labels(wrapper, 0)).toEqual(['Fast Attitude', 'GPS', 'Bit 5'])
  expect(wrapper.find('#setup-unnamed').exists()).toBe(false)
  expect([0, 1, 2].map(index => ticked(wrapper, 0, index))).toEqual([true, false, true])
})

it('changes nothing on the vehicle when ticking: it says what would change, and queues it only on the button', async () => {
  const { wrapper, handle } = await page()
  expect(wrapper.find('#setup-armed').exists()).toBe(false)

  // Bit 17 on, bit 0 off: LOG_BITMASK 5 → 131076.
  await box(wrapper, 0, 2).setValue(true)
  await box(wrapper, 0, 0).setValue(false)

  expect(wrapper.get('#setup-queue').text()).toBe('Add 1 change to the queue')
  expect(handle.staged.pending()).toEqual([])
  expect(handle.parameters.params.value.find(p => p.id === 'LOG_BITMASK')?.value).toBe(5)

  await wrapper.get('#setup-queue').trigger('click')
  await flushPromises()

  expect(handle.staged.pending()).toEqual([{ id: 'LOG_BITMASK', from: 5, to: 131076 }])
  expect(wrapper.get('#staged').text()).toContain('LOG_BITMASK')
  expect(wrapper.get('#staged').text()).toContain('131076')
  // The queue is the one every other parameter change goes through: written from there, after its question.
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('#setup-queue').attributes('aria-disabled')).toBe('true')
})

it('puts the ticks back, and queues nothing for ticks that end where the vehicle is', async () => {
  const { wrapper, handle } = await page()

  await box(wrapper, 0, 0).setValue(false)
  await box(wrapper, 0, 0).setValue(true)
  expect(wrapper.get('#setup-queue').attributes('aria-disabled')).toBe('true')
  await box(wrapper, 0, 0).setValue(false)
  await wrapper.get('#setup-revert').trigger('click')

  expect(ticked(wrapper, 0, 0)).toBe(true)
  expect(handle.staged.pending()).toEqual([])
})

it('refuses everything while the vehicle is armed: a banner, boxes that are off, nothing queued', async () => {
  const { wrapper, handle } = await page({ tick: ARMED })

  expect(wrapper.get('#setup-armed').text()).toContain('armed')
  expect(wrapper.findAll('fieldset input').every(input => (input.element as HTMLInputElement).disabled)).toBe(true)
  await wrapper.get('#setup-queue').trigger('click')

  expect(handle.staged.pending()).toEqual([])
  expect(wrapper.get('#setup-queue').attributes('aria-disabled')).toBe('true')
})

it('counts a vehicle whose state is not known as armed', async () => {
  const { wrapper } = await page({ tick: null })

  expect(wrapper.find('#setup-armed').exists()).toBe(true)
  expect(wrapper.findAll('fieldset input').every(input => (input.element as HTMLInputElement).disabled)).toBe(true)
})

it('does not write a logging change that was queued before the vehicle armed, and says why', async () => {
  const { wrapper, handle } = await page()
  await box(wrapper, 0, 2).setValue(true)
  await wrapper.get('#setup-queue').trigger('click')
  await flushPromises()
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeUndefined()

  feed(handle, { telemetry: telemetryAt(ARMED) })
  await flushPromises()

  expect(wrapper.get('#write-staged').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#staged-armed').text()).toContain('Disarm it first')
})

it('shows -1 (every bit) as every box ticked, and unticking one queues -1 minus that bit, as an int32', async () => {
  const { wrapper, handle } = await page({ params: [param('LOG_BITMASK', -1, 0), ...LOGGING_PARAMS.slice(1)] })

  expect([0, 1, 2, 3].map(index => ticked(wrapper, 0, index))).toEqual([true, true, true, true])
  await box(wrapper, 0, 1).setValue(false)
  await wrapper.get('#setup-queue').trigger('click')
  await flushPromises()

  // The boxes are bits 0 to 31 (every bit is on), so the second box is bit 1: -1 - 2.
  expect(handle.staged.pending()).toEqual([{ id: 'LOG_BITMASK', from: -1, to: -3 }])
})

it('ticks nothing and queues nothing when a mask is not an int32, and says why', async () => {
  const { wrapper, handle } = await page({ params: [param('LOG_BITMASK', 2 ** 33, 0), ...LOGGING_PARAMS.slice(1)] })

  expect(wrapper.get('#setup-not-editable').text()).toContain('32 bits')
  expect(wrapper.findAll('fieldset input').every(input => (input.element as HTMLInputElement).disabled)).toBe(true)
  await wrapper.get('#setup-queue').trigger('click')

  expect(handle.staged.pending()).toEqual([])
})

it('refuses a logging change in the queue itself while the vehicle is armed or unknown, not only in the page', async () => {
  const armed = await page({ tick: ARMED })
  expect(armed.handle.staged.stage([{ id: 'LOG_BITMASK', to: 7 }, { id: 'RTL_ALT', to: 2000 }])).toBe(1)
  expect(armed.handle.staged.pending().map(change => change.id)).toEqual(['RTL_ALT'])
  mounted?.unmount()

  const unknown = await page({ tick: null })
  expect(unknown.handle.staged.stage([{ id: 'INS_LOG_BAT_MASK', to: 1 }])).toBe(0)
  expect(unknown.handle.staged.pending()).toEqual([])
})

it('turns off the box whose tick would give a mask that cannot be written exactly, and says why', async () => {
  // -1 is every bit; unticking bit 4 gives -17, which a 32-bit float holds; unticking bit 30 gives -1073741825, which does not.
  const { wrapper } = await page({ params: [param('LOG_BITMASK', -1, 0), ...LOGGING_PARAMS.slice(1)] })
  const disabled = (index: number) => (box(wrapper, 0, index).element as HTMLInputElement).disabled

  expect(wrapper.get('#setup-inexact').text()).toContain('32-bit floats')
  // The boxes are bits 0 to 31, in order.
  expect(disabled(4)).toBe(false)
  expect(disabled(30)).toBe(true)
})

it('does not block the write of a change that is not a logging setting', async () => {
  const { wrapper, handle } = await page({ tick: ARMED })
  handle.staged.stage([{ id: 'RTL_ALT', to: 2000 }])
  await flushPromises()

  expect(wrapper.find('#staged-armed').exists()).toBe(false)
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeUndefined()
})

it('labels the size as an estimate, says what it rests on, and counts batch sampling at most one ISBD an interval', async () => {
  const { wrapper } = await page()

  expect(wrapper.get('#setup-batch').text()).toBe('Batch sampling is off.')
  expect(wrapper.get('#setup-measured').text()).toContain('No downloaded log')
  await box(wrapper, 1, 0).setValue(true)

  // 3000 messages a minute of 207 bytes: 621 000 bytes, 0.6 MB.
  expect(wrapper.get('#setup-batch').text())
    .toBe('With these settings batch sampling writes at most 0.6 MB a minute (now at most 0.0).')
  const estimate = wrapper.get('.setup-estimate').text()
  expect(estimate).toContain('estimate')
  expect(estimate).toContain('207-byte ISBD message every INS_LOG_BAT_LGIN milliseconds')
  expect(wrapper.get('#setup-fills').text()).toContain('fills the vehicle')
})

/**
 * A log of the library.
 *
 * @param id its number
 * @param size its size in bytes
 * @param summary what a read of it found
 * @param summary.verified whether it is verified
 * @param summary.seconds how long it is
 * @returns the log
 */
function logOf(id: number, size: number, summary: { verified: boolean, seconds: number }): LocalLog {
  return {
    vehicle: 'v',
    crc: 'c',
    key: `v/${id}`,
    id,
    size,
    modified: id * 1000,
    summary: { verified: summary.verified, messages: 1, problems: 0, modeChanges: 0, firstUs: 0, lastUs: summary.seconds * 1e6 },
  }
}

it('measures the newest verified log by its size over its length, and ignores one that is not verified', async () => {
  const { wrapper, handle } = await page()
  const measured = () => wrapper.get('#setup-measured').text()

  // The newest (3) is 1 byte over a second: 60 bytes a minute. A log that is older is not looked at.
  handle.flights.logs.value = [logOf(3, 1, { verified: true, seconds: 1 }), logOf(2, 12_000_000, { verified: true, seconds: 60 })]
  await flushPromises()
  expect(measured()).toContain('about 0.0 MB a minute')

  handle.flights.logs.value = [logOf(2, 12_000_000, { verified: true, seconds: 60 })]
  await flushPromises()
  expect(measured()).toContain('about 12.0 MB a minute')

  handle.flights.logs.value = [logOf(1, 1, { verified: false, seconds: 1 })]
  await flushPromises()
  expect(measured()).toContain('No downloaded log')
})
