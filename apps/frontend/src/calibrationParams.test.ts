import { expect, it } from 'vitest'
import { PARAMS } from './fixtures'
import { isCalibration, isCounter } from './calibrationParams'

it('knows the compass, accelerometer, trim and radio values of a calibration', () => {
  const names = [
    'COMPASS_OFS_X',
    'COMPASS_OFS2_Y',
    'COMPASS_DIA_Z',
    'COMPASS_ODI2_X',
    'COMPASS_MOT_Y',
    'COMPASS_DEV_ID',
    'COMPASS_DEV_ID2',
    'COMPASS_ORIENT',
    'INS_ACCOFFS_X',
    'INS_ACC2SCAL_Z',
    'INS_ACC_ID',
    'INS_ACC3_ID',
    'AHRS_TRIM_X',
    'RC1_MIN',
    'RC12_TRIM',
    'RC4_MAX',
  ]

  expect(names.filter(name => !isCalibration(name))).toEqual([])
})

it('does not take other parameters for calibration values', () => {
  const others = ['COMPASS_USE', 'COMPASS_AUTODEC', 'INS_ACC_BODYFIX', 'AHRS_GPS_USE', 'RC1_OPTION', 'RCMAP_ROLL', 'RTL_ALT']

  expect(others.filter(isCalibration)).toEqual([])
  expect(PARAMS.filter(param => isCalibration(param.id))).toEqual([])
})

it('knows the counters the vehicle keeps by itself', () => {
  expect(['STAT_RUNTIME', 'STAT_BOOTCNT', 'STAT_FLTTIME'].every(isCounter)).toBe(true)
  expect(['STATUS_X', 'SERIAL0_BAUD'].some(isCounter)).toBe(false)
})
