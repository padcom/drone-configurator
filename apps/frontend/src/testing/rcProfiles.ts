// Mappings for the tests of the RC control: the suggested one, calibrated as the wizard would calibrate it.
import { calibrated } from '@/lib/rc/edits'
import { suggestedProfile } from '@/lib/rc/suggest'
import type { AxisCalibration, Profile } from '@/lib/rc/types'

/** What every axis of the test pad calibrates to. */
export const CALIBRATION: AxisCalibration = { min: -1, center: 0, max: 1 }

/**
 * The mapping offered for a device, calibrated: every axis it uses measured.
 *
 * @param device the device
 * @returns the mapping, calibrated
 */
export function calibratedSuggestion(device = 'pad'): Profile {
  const base = suggestedProfile(device, null)
  const measured = new Map(base.rows.map(row => [row.kind === 'stick' ? row.axis : -1, CALIBRATION]))

  return calibrated(base, measured)!
}
