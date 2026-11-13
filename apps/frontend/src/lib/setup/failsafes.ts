// What each failsafe parameter of a Copter can be set to, in words. The lists are ArduPilot's own (ArduCopter/Parameters.cpp:
// FS_GCS_ENABLE line 99, FS_THR_ENABLE line 127, FS_EKF_ACTION line 270; libraries/AP_BattMonitor/AP_BattMonitor_Params.cpp:
// BATT_FS_LOW_ACT and BATT_FS_CRT_ACT line 146, the values of Copter); a value that is not in the list (a removed one, a newer
// firmware's) has no name here and is shown as its number, never as a name that was guessed. What a value does is what
// ArduPilot's list says: for the radio and the ground station 0 is "Disabled" (the failsafe is off and nothing warns at all), for
// the battery 0 is "Warn only" and for the EKF "Report only"; EKF 1 and 2 act only in a mode that needs a position.

/** What a failsafe does, by a name that is the same in every language (the words are `setup.action.<name>`). */
export type Action
  = | 'nothing' | 'disabled' | 'rtl' | 'land' | 'smartRtlOrRtl' | 'smartRtlOrLand' | 'terminate' | 'autoLandOrRtl'
    | 'brakeOrLand' | 'landIfPosition' | 'altHold' | 'landAnyMode'

/** The failsafes the page has a row for. */
export type FailsafeKind = 'batteryLow' | 'batteryCritical' | 'radio' | 'gcs' | 'ekf'

/** A value of a parameter and the action it stands for. */
interface Choice {
  value: number
  action: Action
}

const BATTERY: readonly Choice[] = [
  { value: 0, action: 'nothing' },
  { value: 1, action: 'land' },
  { value: 2, action: 'rtl' },
  { value: 3, action: 'smartRtlOrRtl' },
  { value: 4, action: 'smartRtlOrLand' },
  { value: 5, action: 'terminate' },
  { value: 6, action: 'autoLandOrRtl' },
  { value: 7, action: 'brakeOrLand' },
]

const RADIO: readonly Choice[] = [
  { value: 0, action: 'disabled' },
  { value: 1, action: 'rtl' },
  { value: 3, action: 'land' },
  { value: 4, action: 'smartRtlOrRtl' },
  { value: 5, action: 'smartRtlOrLand' },
  { value: 6, action: 'autoLandOrRtl' },
  { value: 7, action: 'brakeOrLand' },
]

const GCS: readonly Choice[] = [
  { value: 0, action: 'disabled' },
  { value: 1, action: 'rtl' },
  { value: 3, action: 'smartRtlOrRtl' },
  { value: 4, action: 'smartRtlOrLand' },
  { value: 5, action: 'land' },
  { value: 6, action: 'autoLandOrRtl' },
  { value: 7, action: 'brakeOrLand' },
]

const EKF: readonly Choice[] = [
  { value: 0, action: 'nothing' },
  { value: 1, action: 'landIfPosition' },
  { value: 2, action: 'altHold' },
  { value: 3, action: 'landAnyMode' },
]

/** The parameters of a failsafe: the one that says what to do, and the one that says when (a voltage), when it has one. */
export interface FailsafeParams {
  /** The parameter that says what to do. */
  action: string
  /** The parameter that says when (a voltage), for a failsafe that has one. */
  threshold?: string
}

/** The failsafes, in the order of the page: what each writes, and what it can be set to. */
export const FAILSAFES: Readonly<Record<FailsafeKind, FailsafeParams & { choices: readonly Choice[] }>> = {
  batteryLow: { action: 'BATT_FS_LOW_ACT', threshold: 'BATT_LOW_VOLT', choices: BATTERY },
  batteryCritical: { action: 'BATT_FS_CRT_ACT', threshold: 'BATT_CRT_VOLT', choices: BATTERY },
  radio: { action: 'FS_THR_ENABLE', choices: RADIO },
  gcs: { action: 'FS_GCS_ENABLE', choices: GCS },
  ekf: { action: 'FS_EKF_ACTION', choices: EKF },
}

/** The failsafes in the order of the page. */
export const FAILSAFE_ORDER: readonly FailsafeKind[] = ['batteryLow', 'batteryCritical', 'radio', 'gcs', 'ekf']

/** Every parameter the page writes: the actions, and the voltages of the battery. */
export const FAILSAFE_PARAMS: readonly string[] = FAILSAFE_ORDER.flatMap(kind => {
  const { action, threshold } = FAILSAFES[kind]

  return threshold === undefined ? [action] : [action, threshold]
})

/**
 * A voltage as typed: volts that are not negative.
 *
 * @param text what was typed
 * @returns the voltage, or null when it is not one
 */
export function parseVolts(text: string): number | null {
  const volts = Number(text)

  return text.trim() !== '' && Number.isFinite(volts) && volts >= 0 ? volts : null
}

/**
 * The action a value of a failsafe parameter stands for.
 *
 * @param kind the failsafe
 * @param value the parameter's value
 * @returns the action, or null for a value that has no name here
 */
export function actionOf(kind: FailsafeKind, value: number): Action | null {
  return FAILSAFES[kind].choices.find(choice => choice.value === value)?.action ?? null
}

/**
 * The values a failsafe can be set to, each with its action.
 *
 * @param kind the failsafe
 * @returns the choices
 */
export function choicesOf(kind: FailsafeKind): readonly { value: number, action: Action }[] {
  return FAILSAFES[kind].choices
}

/**
 * Whether a choice leaves the vehicle without a failsafe, only warns, or stops its motors: the page says so in a line of its own
 * (a failsafe that is off is the one thing that must not look like a setting made).
 *
 * @param action the action
 * @returns true for disabled, warn only, and stopping the motors
 */
export function isDangerous(action: Action | null): boolean {
  return action === 'nothing' || action === 'disabled' || action === 'terminate'
}

/**
 * Whether the critical voltage is not below the low voltage (a critical level above the low one never comes after it): the page
 * does not write such a pair. A voltage of 0 is "off", and makes no pair.
 *
 * @param low the low voltage (BATT_LOW_VOLT)
 * @param critical the critical voltage (BATT_CRT_VOLT)
 * @returns true when the pair is out of order
 */
export function voltagesOutOfOrder(low: number, critical: number): boolean {
  return low > 0 && critical > 0 && critical >= low
}
