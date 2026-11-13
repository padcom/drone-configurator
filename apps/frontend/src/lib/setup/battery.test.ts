import { expect, it } from 'vitest'
import { MONITORS, batteryParams, calibrated, needsSecondLook, parseAmount, rounded } from './battery'

it('names the parameters of each battery by its prefix', () => {
  expect(batteryParams(0)).toEqual(['BATT_MONITOR', 'BATT_CAPACITY', 'BATT_VOLT_MULT', 'BATT_AMP_PERVLT'])
  expect(batteryParams(1)).toEqual(['BATT2_MONITOR', 'BATT2_CAPACITY', 'BATT2_VOLT_MULT', 'BATT2_AMP_PERVLT'])
})

it('works out the multiplier from what a meter says over what the vehicle shows, times the one it has', () => {
  // 10.1 is what the 3DR power brick has; the vehicle shows 12.54 V and the meter 12.62 V.
  expect(calibrated(10.1, 12.62, 12.54)).toBe(10.164)
  // A vehicle that reads right changes nothing.
  expect(calibrated(10.1, 12.54, 12.54)).toBe(10.1)
  // Twice what it shows halves nothing: the multiplier doubles.
  expect(calibrated(10, 20, 10)).toBe(20)
})

it('proposes nothing when there is no reading, nothing shown, or a parameter of 0', () => {
  expect(calibrated(10.1, 0, 12.54)).toBeNull()
  expect(calibrated(10.1, 12.62, 0)).toBeNull()
  expect(calibrated(0, 12.62, 12.54)).toBeNull()
})

it('asks for a second look when the meter is more than 15% from what the vehicle shows', () => {
  expect(needsSecondLook(12.62, 12.54)).toBe(false)
  expect(needsSecondLook(14.5, 12.54)).toBe(true)
  expect(needsSecondLook(10.5, 12.54)).toBe(true)
  expect(needsSecondLook(12, 0)).toBe(false)
})

it('takes a number that is not negative, and nothing else', () => {
  expect(parseAmount('12.62')).toBe(12.62)
  expect(parseAmount('0')).toBe(0)
  expect(parseAmount('')).toBeNull()
  expect(parseAmount('-1')).toBeNull()
  expect(parseAmount('abc')).toBeNull()
})

it('rounds a float the vehicle holds to the three decimals a multiplier has', () => {
  expect(rounded(10.100000381469727)).toBe(10.1)
  expect(rounded(10.1644)).toBe(10.164)
})

it('has a name for each monitor choice, once', () => {
  const names = MONITORS.map(monitor => monitor.name)

  expect(new Set(names).size).toBe(names.length)
  expect(MONITORS.find(monitor => monitor.value === 4)?.name).toBe('analogVoltageCurrent')
})
