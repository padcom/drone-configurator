// The initial tune: every number is the one Mission Planner's Initial Parameter Setup calculates (ConfigInitialParams.cs, the
// lines are in initialTune.ts), for any size above 0, with no value where the size or the cells are not known.
import { describe, expect, it } from 'vitest'
import {
  CHEMISTRIES, INITIAL_TUNE_IDS, MAX_CELLS, MAX_SIZE, MIN_SIZE, beyondRange, initialTune, parseCells, parseSize,
} from './initialTune'

const LIPO = CHEMISTRIES[0]!
const LIPO_HV = CHEMISTRIES[1]!
const LIION = CHEMISTRIES[2]!

/**
 * The values of a size and a battery as an object by name.
 *
 * @param size the size
 * @param cells the cells
 * @param chemistry the kind of battery
 * @returns each parameter's value (null for none)
 */
function valuesOf(size: number | null, cells: number | null, chemistry = LIPO): Record<string, number | null> {
  return Object.fromEntries(initialTune({ size, cells, chemistry }).map(item => [item.id, item.value]))
}

describe('the values of the default of Mission Planner (9 inch, 4 cells of LiPo)', () => {
  const values = valuesOf(9, 4)

  it('are its accelerations, from a polynomial of the size, to hundreds of centi-degrees', () => {
    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_R_MAX, values.ATC_ACC_Y_MAX]).toEqual([1259, 1259, 279])
    expect([values.ATC_ACCEL_P_MAX, values.ATC_ACCEL_R_MAX, values.ATC_ACCEL_Y_MAX]).toEqual([125_900, 125_900, 27_900])
    expect(values.ACRO_YAW_P).toBe(3.1)
  })

  it('are its filters: the gyro filter from a power of the size, the rate filters at half of it (at least 10)', () => {
    expect(values.INS_GYRO_FILTER).toBe(46)
    expect(values.INS_ACCEL_FILTER).toBe(10)

    for (const id of ['ATC_RAT_RLL_FLTD', 'ATC_RAT_RLL_FLTT', 'ATC_RAT_PIT_FLTD', 'ATC_RAT_PIT_FLTT', 'ATC_RAT_YAW_FLTT']) {
      expect(values[id]).toBe(23)
    }
    const extra = [values.ATC_RAT_RLL_FLTE, values.ATC_RAT_PIT_FLTE, values.ATC_RAT_YAW_FLTD, values.ATC_RAT_YAW_FLTE]

    expect(extra).toEqual([0, 0, 0, 2])
  })

  it('are its thrust expo, hover and mix', () => {
    expect(values.MOT_THST_EXPO).toBe(0.58)
    expect(values.MOT_THST_HOVER).toBe(0.2)
    expect(values.ATC_THR_MIX_MAN).toBe(0.1)
  })

  it('are the voltages of 4 cells: arm, critical, low, and the most and the least of the motors', () => {
    expect([values.BATT_ARM_VOLT, values.BATT_CRT_VOLT, values.BATT_LOW_VOLT]).toEqual([14.7, 14, 14.4])
    expect([values.MOT_BAT_VOLT_MAX, values.MOT_BAT_VOLT_MIN]).toEqual([16.8, 13.2])
  })
})

describe('the values of other sizes', () => {
  it('are 10 inch: not the web page\'s 40 and 1100, but the formulas\'', () => {
    const values = valuesOf(10, 4)

    expect(values.INS_GYRO_FILTER).toBe(42)
    expect(values.ATC_RAT_RLL_FLTD).toBe(21)
    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_Y_MAX]).toEqual([1167, 270])
    expect(values.MOT_THST_EXPO).toBe(0.6)
  })

  it('are 5 inch: the accelerations too (the web page gives none)', () => {
    const values = valuesOf(5, 3)

    expect([values.INS_GYRO_FILTER, values.ATC_RAT_RLL_FLTD, values.MOT_THST_EXPO]).toEqual([75, 37.5, 0.49])
    expect([values.ATC_ACC_P_MAX, values.ATC_ACC_R_MAX, values.ATC_ACC_Y_MAX]).toEqual([1686, 1686, 315])
  })

  it('are 20 inch and 30 inch: the least of the gyro filter (20) and of the rate filters (10) holds', () => {
    expect([valuesOf(20, 6).INS_GYRO_FILTER, valuesOf(20, 6).ATC_RAT_PIT_FLTT]).toEqual([23, 11.5])
    const large = valuesOf(30, 6)

    expect([large.INS_GYRO_FILTER, large.ATC_RAT_YAW_FLTT, large.MOT_THST_EXPO]).toEqual([20, 10, 0.77])
    expect([large.ATC_ACC_P_MAX, large.ATC_ACC_Y_MAX]).toEqual([218, 90])
  })

  it('keep the least accelerations (10000 and 8000 centi-degrees) and the greatest expo (0.8) for a huge size', () => {
    const huge = valuesOf(60, 4)

    expect([huge.ATC_ACCEL_P_MAX, huge.ATC_ACCEL_Y_MAX, huge.MOT_THST_EXPO]).toEqual([10_000, 8000, 0.8])
  })
})

/**
 * The five voltages of a battery, in the order the tests say them.
 *
 * @param values the values of a size and a battery
 * @returns MOT_BAT_VOLT_MAX, MOT_BAT_VOLT_MIN, BATT_CRT_VOLT, BATT_LOW_VOLT, BATT_ARM_VOLT
 */
function volts(values: Record<string, number | null>): (number | null | undefined)[] {
  return ['MOT_BAT_VOLT_MAX', 'MOT_BAT_VOLT_MIN', 'BATT_CRT_VOLT', 'BATT_LOW_VOLT', 'BATT_ARM_VOLT'].map(id => values[id])
}

describe('the battery', () => {
  it('has the voltage of the cells of each kind: LiPo 4.2/3.3, LiPoHV 4.35/3.3, LiIon 4.1/2.8', () => {
    expect(CHEMISTRIES.map(kind => [kind.id, kind.cellMax, kind.cellMin])).toEqual([
      ['LiPo', 4.2, 3.3], ['LiPoHV', 4.35, 3.3], ['LiIon', 4.1, 2.8],
    ])
    expect(valuesOf(10, 3, LIPO).MOT_BAT_VOLT_MAX).toBe(12.6)
    const hv = valuesOf(10, 6, LIPO_HV)

    expect(volts(hv)).toEqual([26.1, 19.8, 21, 21.6, 22.1])
    const ion = valuesOf(10, 4, LIION)

    expect(volts(ion)).toEqual([16.4, 11.2, 12, 12.4, 12.7])
  })

  it('has one cell\'s arm voltage without the 0.1 V of the others', () => {
    expect(valuesOf(10, 1).BATT_ARM_VOLT).toBe(3.6)
  })
})

describe('a value outside the range ArduPilot documents', () => {
  /**
   * The suggestions that have no value because of the range.
   *
   * @param size the size
   * @param cells the cells
   * @returns their names
   */
  function outside(size: number, cells: number): string[] {
    return initialTune({ size, cells, chemistry: LIPO }).filter(item => item.why === 'range').map(item => item.id)
  }

  it('is not offered: the accelerations of a 4 inch propeller (1808 deg/s/s, range 0 to 1800) and smaller', () => {
    const acc = ['ATC_ACC_P_MAX', 'ATC_ACC_R_MAX', 'ATC_ACCEL_P_MAX', 'ATC_ACCEL_R_MAX']

    expect(outside(4, 4)).toEqual(acc)
    expect(outside(3, 4)).toEqual(acc)
    expect(outside(1, 4).filter(id => id.includes('ACC'))).toEqual(acc)
    // (the same values in centi-degrees, by the range of the old names: the new one x100)
    expect(valuesOf(4, 4).ATC_ACCEL_P_MAX).toBeNull()
    expect(valuesOf(4, 4).ATC_ACC_P_MAX).toBeNull()
    expect(valuesOf(5, 4).ATC_ACCEL_P_MAX).toBe(168_600)
    expect(valuesOf(1, 4).ATC_ACCEL_P_MAX).toBeNull()
  })

  it('is not offered: the gyro filter of a propeller of about 1 inch (289 Hz, range 0 to 256)', () => {
    expect(outside(1, 4)).toContain('INS_GYRO_FILTER')
    expect(outside(2, 4)).not.toContain('INS_GYRO_FILTER')
    expect(valuesOf(2, 4).INS_GYRO_FILTER).toBe(162)
  })
})

describe('a value outside the range of a battery, and the ones inside', () => {
  /**
   * The suggestions that have no value because of the range.
   *
   * @param size the size
   * @param cells the cells
   * @returns their names
   */
  function outside(size: number, cells: number): string[] {
    return initialTune({ size, cells, chemistry: LIPO }).filter(item => item.why === 'range').map(item => item.id)
  }

  it('is not offered: the voltages of a single cell (4.2 and 3.3 V, ranges from 6 V)', () => {
    expect(outside(10, 1)).toEqual(['MOT_BAT_VOLT_MAX', 'MOT_BAT_VOLT_MIN'])
    expect(outside(10, 2)).toEqual([])
    expect(valuesOf(10, 2).MOT_BAT_VOLT_MIN).toBe(6.6)
  })

  it('is offered when it is inside: the sizes and the packs of the usual', () => {
    expect([5, 9, 10, 20, 30, 60].flatMap(size => outside(size, 4))).toEqual([])
    expect(outside(10, 12)).toEqual([])
  })
})

describe('what is not known', () => {
  it('has no value for the size parameters until the size is known, and says that is why', () => {
    const items = initialTune({ size: null, cells: 4, chemistry: LIPO })
    const none = items.filter(item => item.value === null)

    expect(none.every(item => item.why === 'size')).toBe(true)
    expect(none.map(item => item.id)).toContain('INS_GYRO_FILTER')
    expect(none.map(item => item.id)).not.toContain('MOT_BAT_VOLT_MAX')
    // (what is fixed does not wait for the size)
    expect(valuesOf(null, 4).INS_ACCEL_FILTER).toBe(10)
  })

  it('has no voltage until the cells are known, and says that is why', () => {
    const none = initialTune({ size: 10, cells: null, chemistry: LIPO }).filter(item => item.value === null)

    expect(none.map(item => [item.id, item.why])).toEqual([
      ['BATT_ARM_VOLT', 'cells'],
      ['BATT_CRT_VOLT', 'cells'],
      ['BATT_LOW_VOLT', 'cells'],
      ['MOT_BAT_VOLT_MAX', 'cells'],
      ['MOT_BAT_VOLT_MIN', 'cells'],
    ])
  })

  it('names every parameter once, and none of the optional boxes or the old names', () => {
    expect(new Set(INITIAL_TUNE_IDS).size).toBe(INITIAL_TUNE_IDS.length)
    const optional = INITIAL_TUNE_IDS.filter(id => id.endsWith('_FILT') || /^(?:Q_|FENCE_)/u.test(id) || id.includes('PWM'))

    expect(optional).toEqual([])
    expect(INITIAL_TUNE_IDS).toHaveLength(26)
  })
})

describe('the size', () => {
  it('is a number of inches from 1 to 60 with one decimal at most', () => {
    expect(['9', ' 10 ', '7.5', '60', '1'].map(parseSize)).toEqual([9, 10, 7.5, 60, 1])
    const not = ['', '0', '0.5', '61', '-3', '9.55', '9,5', '1e1', '0x9', 'abc', '100']

    expect(not.map(parseSize)).toEqual(not.map(() => null))
    expect([MIN_SIZE, MAX_SIZE]).toEqual([1, 60])
  })
})

describe('the cells', () => {
  it('are a whole number from 1 to 12', () => {
    expect(['1', '4', ' 6 ', '12'].map(parseCells)).toEqual([1, 4, 6, 12])
    expect(['', ' ', '0', '13', '-3', '2.5', '4s', 'abc', '1e1'].map(parseCells)).toEqual(Array.from({ length: 9 }, () => null))
    expect(MAX_CELLS).toBe(12)
  })
})

describe('a vehicle whose acceleration limit is in another unit', () => {
  it('has a value beyond the range of ATC_ACC_*_MAX (1800, 720 for yaw), and only then', () => {
    const pitchRoll = [110_000, 1800, 1801].map(now => beyondRange('ATC_ACC_R_MAX', now))
    const yaw = [beyondRange('ATC_ACC_Y_MAX', 721), beyondRange('ATC_ACC_Y_MAX', 720), beyondRange('ATC_ACC_P_MAX', null)]

    expect(pitchRoll).toEqual([true, false, true])
    expect(yaw).toEqual([true, false, false])
    expect(beyondRange('INS_GYRO_FILTER', 100_000)).toBe(false)
  })
})
