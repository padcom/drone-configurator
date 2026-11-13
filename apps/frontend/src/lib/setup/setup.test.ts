import { expect, it } from 'vitest'
import { FAILSAFES, actionOf, choicesOf, isDangerous, voltagesOutOfOrder } from './failsafes'
import { CHANNEL_PARAM, MODE_PARAMS, SLOT_PARAMS, hasHint, noEscape, slotFor } from './flightModes'
import { setupStatus } from './setupStatus'

/** A vehicle that was set up: every parameter the steps look at has a value that is not the default. */
const SET_UP: [string, number][] = [
  ['FRAME_CLASS', 1],
  ['FRAME_TYPE', 1],
  ['INS_ACCOFFS_X', 0.1],
  ['INS_ACCOFFS_Y', 0],
  ['INS_ACCOFFS_Z', 0],
  ['INS_ACCSCAL_X', 1],
  ['INS_ACCSCAL_Y', 1],
  ['INS_ACCSCAL_Z', 1],
  ['COMPASS_OFS_X', 12],
  ['COMPASS_OFS_Y', 0],
  ['COMPASS_OFS_Z', 0],
  ['RC1_MIN', 1000],
  ['RC2_MIN', 1000],
  ['RC3_MIN', 1000],
  ['RC4_MIN', 1000],
  ['RC1_MAX', 2000],
  ['RC2_MAX', 2000],
  ['RC3_MAX', 2000],
  ['RC4_MAX', 2000],
  ['FLTMODE1', 0],
  ['FLTMODE2', 5],
  ['FLTMODE3', 6],
  ['FLTMODE4', 3],
  ['FLTMODE5', 9],
  ['FLTMODE6', 16],
  ['FLTMODE_CH', 5],
  ['FS_THR_ENABLE', 1],
  ['FS_GCS_ENABLE', 0],
  ['FS_EKF_ACTION', 1],
  ['BATT_FS_LOW_ACT', 2],
  ['BATT_MONITOR', 4],
  ['BATT_CAPACITY', 5200],
]

/**
 * The parameters of a set-up vehicle, with some changed.
 *
 * @param changes the values to put in place of the set-up ones
 * @returns the parameters by name
 */
function values(changes: Record<string, number | null> = {}): Map<string, number> {
  const map = new Map(SET_UP)
  for (const [id, value] of Object.entries(changes)) {
    if (value === null) {
      map.delete(id)
    } else {
      map.set(id, value)
    }
  }

  return map
}

it('says every step that can be told is done for a vehicle that was set up, and the motors cannot be told', () => {
  const status = setupStatus(values())

  expect(status.steps.map(step => `${step.id}:${step.state}`)).toEqual([
    'frame:done', 'accel:done', 'compass:done', 'radio:done', 'motors:unknown', 'modes:done', 'failsafes:done', 'battery:done',
  ])
  expect(status.required).toBe(7)
  expect(status.done).toBe(7)
  expect(status.next).toBeNull()
})

it('says what each step looked at, and no card says verified or valid', () => {
  const words = setupStatus(values()).steps.flatMap(step => [step.value.key, step.checked.key]).join(' ')

  expect(words).not.toMatch(/verified|valid|calibrated/iu)
  expect(setupStatus(values()).steps.every(step => step.checked.key.startsWith('setup.status.'))).toBe(true)
})

it('opens the steps whose parameters are all at the defaults of a vehicle that was never set up', () => {
  const fresh = setupStatus(values({
    FRAME_CLASS: 0, INS_ACCOFFS_X: 0, COMPASS_OFS_X: 0,
    RC1_MIN: 1100, RC2_MIN: 1100, RC3_MIN: 1100, RC4_MIN: 1100, RC1_MAX: 1900, RC2_MAX: 1900, RC3_MAX: 1900, RC4_MAX: 1900,
    FS_THR_ENABLE: 0, BATT_MONITOR: 0,
  }))

  const open = fresh.steps.filter(step => step.state === 'open').map(step => step.id)

  expect(open).toEqual(['frame', 'accel', 'compass', 'radio', 'failsafes', 'battery'])
  expect(fresh.done).toBe(1)
  expect(fresh.next?.id).toBe('frame')
})

it('treats an accelerometer with only a scale changed as set up (a scale that is not 1)', () => {
  expect(setupStatus(values({ INS_ACCOFFS_X: 0, INS_ACCSCAL_X: 1.01 })).steps[1]?.state).toBe('done')
})

it('opens the flight modes when no slot can bring the vehicle home or down', () => {
  const noHome = setupStatus(values({ FLTMODE3: 5, FLTMODE5: 5 }))

  expect(noHome.steps.find(step => step.id === 'modes')?.state).toBe('open')
  expect(noHome.steps.find(step => step.id === 'modes')?.value.key).toBe('setup.status.modes.noEscape')
})

it('never says open or done for a step whose parameters are not on the vehicle: it is unknown', () => {
  const status = setupStatus(values({ COMPASS_OFS_X: null, FLTMODE_CH: null, BATT_CAPACITY: null }))

  const unknown = status.steps.filter(step => step.state === 'unknown').map(step => step.id)

  expect(unknown).toEqual(['compass', 'motors', 'modes', 'battery'])
  expect(status.required).toBe(4)
  expect(setupStatus(new Map()).required).toBe(0)
  expect(setupStatus(new Map()).next).toBeNull()
})

it('counts the failsafes that are on, and opens the step when the radio failsafe is off', () => {
  expect(setupStatus(values()).steps.find(step => step.id === 'failsafes')?.value.params).toEqual({ on: 3 })
  expect(setupStatus(values({ FS_THR_ENABLE: 0 })).steps.find(step => step.id === 'failsafes')?.value.key)
    .toBe('setup.status.failsafes.radioOff')
})

it('names the actions of ArduPilot\'s lists, and no action for a value that is not in them', () => {
  expect(actionOf('batteryLow', 2)).toBe('rtl')
  expect(actionOf('batteryLow', 5)).toBe('terminate')
  expect(actionOf('radio', 3)).toBe('land')
  expect(actionOf('radio', 2)).toBeNull()
  expect(actionOf('gcs', 5)).toBe('land')
  expect(actionOf('ekf', 2)).toBe('altHold')
  expect(actionOf('ekf', 9)).toBeNull()
})

it('writes the four failsafe parameters of the battery and the three others, and no other', () => {
  expect(Object.values(FAILSAFES).flatMap(f => [f.action, ...f.threshold ? [f.threshold] : []]).sort()).toEqual([
    'BATT_CRT_VOLT', 'BATT_FS_CRT_ACT', 'BATT_FS_LOW_ACT', 'BATT_LOW_VOLT', 'FS_EKF_ACTION', 'FS_GCS_ENABLE', 'FS_THR_ENABLE',
  ])
  expect(choicesOf('ekf').map(choice => choice.value)).toEqual([0, 1, 2, 3])
})

it('warns for a failsafe that does nothing and for one that stops the motors', () => {
  expect(isDangerous('nothing')).toBe(true)
  expect(isDangerous('terminate')).toBe(true)
  expect(isDangerous('rtl')).toBe(false)
  expect(isDangerous(null)).toBe(false)
})

it('finds the critical voltage that is not below the low one, and lets a voltage of 0 (off) be', () => {
  expect(voltagesOutOfOrder(10.5, 10)).toBe(false)
  expect(voltagesOutOfOrder(10.5, 10.5)).toBe(true)
  expect(voltagesOutOfOrder(10.5, 11)).toBe(true)
  expect(voltagesOutOfOrder(0, 11)).toBe(false)
  expect(voltagesOutOfOrder(10.5, 0)).toBe(false)
})

it('writes the six slots and the channel of the mode switch, and puts a pulse width in its slot', () => {
  expect(MODE_PARAMS).toEqual([...SLOT_PARAMS, CHANNEL_PARAM])
  expect([900, 1230, 1231, 1360, 1490, 1620, 1749, 1750, 2000].map(slotFor)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5])
})

it('warns when no slot can bring the vehicle home or down (RTL, Land, SmartRTL)', () => {
  expect(noEscape([0, 5, 3, 16, 17, 7])).toBe(true)
  expect(noEscape([0, 5, 3, 16, 17, 9])).toBe(false)
  expect(noEscape([21, 5, 3, 16, 17, 7])).toBe(false)
})

it('has a line of help for the common modes only', () => {
  expect(hasHint(5)).toBe(true)
  expect(hasHint(99)).toBe(false)
})
