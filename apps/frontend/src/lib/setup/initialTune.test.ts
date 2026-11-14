// The initial tune: every number is the one ArduPilot's page gives (setting-up-for-tuning, quoted in initialTune.ts), for the
// sizes
// it gives and no others, with no value where it gives none and none made up.
import { describe, expect, it } from 'vitest'
import { INITIAL_TUNE_IDS, MAX_CELLS, PROP_SIZES, initialTune, isPropSize, parseCells } from './initialTune'

/**
 * The values of a size as an object by name.
 *
 * @param size the size
 * @param cells the cells
 * @returns each parameter's value (null for none)
 */
function valuesOf(size: 5 | 10 | 20 | 30, cells: number | null): Record<string, number | null> {
  return Object.fromEntries(initialTune(size, cells).map(item => [item.id, item.value]))
}

describe('the sizes', () => {
  it('are the four the page gives, and nothing else is a size', () => {
    expect([...PROP_SIZES]).toEqual([5, 10, 20, 30])
    expect([3, 7, 8, 12, 15, 25, 0, -5, 10.5].map(isPropSize)).toEqual(Array.from({ length: 9 }, () => false))
    expect([5, 10, 20, 30].map(isPropSize)).toEqual([true, true, true, true])
  })
})

describe('the values of 10 inch propellers', () => {
  const values = valuesOf(10, 4)

  it('are the page\'s: filters, accelerations, expo, from the size', () => {
    expect(values.INS_ACCEL_FILTER).toBe(10)
    expect(values.INS_GYRO_FILTER).toBe(40)
    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_R_MAX, values.ATC_ACC_Y_MAX]).toEqual([1100, 1100, 200])
    expect(values.MOT_THST_EXPO).toBe(0.65)
    expect(values.ATC_RAT_YAW_FLTE).toBe(2)
  })

  it('have the rate filters at half of the gyro filter, of the size chosen', () => {
    for (const id of ['ATC_RAT_RLL_FLTD', 'ATC_RAT_RLL_FLTT', 'ATC_RAT_PIT_FLTD', 'ATC_RAT_PIT_FLTT', 'ATC_RAT_YAW_FLTT']) {
      expect(values[id]).toBe(20)
    }
  })

  it('have the voltage of the cells: 4.2 V and 3.3 V a cell, two decimals', () => {
    expect([values.MOT_BAT_VOLT_MAX, values.MOT_BAT_VOLT_MIN]).toEqual([16.8, 13.2])
    expect(valuesOf(10, 3).MOT_BAT_VOLT_MAX).toBe(12.6)
    expect(valuesOf(10, 6).MOT_BAT_VOLT_MIN).toBe(19.8)
  })
})

describe('the values of the other sizes', () => {
  it('are 5 inch: the filters and the expo, and NO acceleration (the page gives none)', () => {
    const values = valuesOf(5, 3)

    expect([values.INS_GYRO_FILTER, values.ATC_RAT_RLL_FLTD, values.MOT_THST_EXPO]).toEqual([80, 40, 0.55])
    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_R_MAX, values.ATC_ACC_Y_MAX]).toEqual([null, null, null])
    const none = initialTune(5, 3).filter(item => item.why === 'notGiven').map(item => item.id)

    expect(none).toEqual(['ATC_ACC_P_MAX', 'ATC_ACC_R_MAX', 'ATC_ACC_Y_MAX'])
  })

  it('are 20 inch', () => {
    const values = valuesOf(20, 6)

    expect([values.INS_GYRO_FILTER, values.ATC_RAT_PIT_FLTT, values.MOT_THST_EXPO]).toEqual([20, 10, 0.75])
    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_R_MAX, values.ATC_ACC_Y_MAX]).toEqual([500, 500, 100])
  })

  it('are 30 inch: the accelerations of 30, and the filter and the expo of "20 inch props (or larger)"', () => {
    const values = valuesOf(30, 12)

    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_R_MAX, values.ATC_ACC_Y_MAX]).toEqual([200, 200, 90])
    expect([values.INS_GYRO_FILTER, values.ATC_RAT_YAW_FLTT, values.MOT_THST_EXPO]).toEqual([20, 10, 0.75])
  })
})

describe('what the page does not give', () => {
  it('is not here: no BATT_*_VOLT and no old *_FILT names', () => {
    expect(INITIAL_TUNE_IDS.some(id => id.startsWith('BATT_'))).toBe(false)
    expect(INITIAL_TUNE_IDS.some(id => id.endsWith('_FILT'))).toBe(false)
    expect(INITIAL_TUNE_IDS).toHaveLength(14)
    expect(new Set(INITIAL_TUNE_IDS).size).toBe(14)
  })

  it('has no voltage until the cells are known, and says that is why', () => {
    const items = initialTune(10, null)

    expect(items.filter(item => item.value === null).map(item => [item.id, item.why])).toEqual([
      ['MOT_BAT_VOLT_MAX', 'cells'],
      ['MOT_BAT_VOLT_MIN', 'cells'],
    ])
  })
})

describe('the cells', () => {
  it('are a whole number from 1 to 12', () => {
    expect(['1', '4', ' 6 ', '12'].map(parseCells)).toEqual([1, 4, 6, 12])
    expect(['', ' ', '0', '13', '-3', '2.5', '4s', 'abc', '1e1'].map(parseCells)).toEqual(Array.from({ length: 9 }, () => null))
    expect(MAX_CELLS).toBe(12)
  })
})
