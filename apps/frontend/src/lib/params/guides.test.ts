import { expect, it } from 'vitest'
import { guideOf } from './guides'

/** Each parameter and the page that sets it. */
const PAGES: [string, string][] = [
  ['BATT_CAPACITY', '/setup/battery'],
  ['BATT_FS_LOW_ACT', '/setup/failsafes'],
  ['BATT_LOW_VOLT', '/setup/failsafes'],
  ['FS_THR_ENABLE', '/setup/failsafes'],
  ['FLTMODE3', '/setup/modes'],
  ['FRAME_CLASS', '/setup/frame'],
  ['INS_ACCOFFS_X', '/setup/accel'],
  ['COMPASS_USE', '/setup/compass'],
  ['RCMAP_ROLL', '/setup/radio'],
  ['RC3_MIN', '/setup/radio'],
  ['MOT_SPIN_ARM', '/setup/motors'],
  ['SERIAL1_PROTOCOL', '/setup/serial'],
  ['ATC_RAT_RLL_P', '/tune/rate'],
  ['INS_HNTCH_ENABLE', '/tune/filters'],
  ['PSC_D_VEL_P', '/tune/more'],
]

it('links a parameter to the Setup or Tune page that sets it, the failsafes of the battery to Failsafes', () => {
  expect(PAGES.map(([id]) => [id, guideOf(id)?.path])).toEqual(PAGES)
  expect(guideOf('FS_THR_ENABLE')).toEqual({ screen: 'setup', section: 'failsafes', path: '/setup/failsafes' })
})

it('has no page for a parameter that no page sets', () => {
  expect(guideOf('FENCE_RADIUS')).toBeNull()
  expect(guideOf('BATT_OPTIONS')).toBeNull()
})
