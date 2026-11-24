// The guided screen of a parameter: the Setup or Tune page that sets it with its own controls, where one exists, so that the
// detail of the Parameters screen can link to it. From the names alone (no DOM): the first rule that matches wins, so the
// failsafe settings of the battery go to Failsafes and the rest of the battery's to Battery. The pages are this application's
// (screens/registry.ts), and each rule names the parameters that page really sets (lib/setup, screens/tune).

/** A guided page. */
export interface Guide {
  /** The screen: Setup or Tune. */
  screen: 'setup' | 'tune'
  /** The page of the screen (a section of screens/registry.ts). */
  section: string
  /** Where it is in the app. */
  path: string
}

/** The rules, in order: what a name matches, and the screen and page that set it. */
const RULES: [RegExp, Guide['screen'], string][] = [
  [/^(?:FS_|BATT\d?_(?:FS_|LOW_VOLT|CRT_VOLT))/u, 'setup', 'failsafes'],
  [/^BATT[0-9A-G]?_(?:MONITOR|CAPACITY|VOLT_MULT|AMP_PERVLT)$/u, 'setup', 'battery'],
  [/^FLTMODE/u, 'setup', 'modes'],
  [/^(?:FRAME_(?:CLASS|TYPE)|AHRS_ORIENTATION)$/u, 'setup', 'frame'],
  [/^INS_ACC(?:OFFS|SCAL)_/u, 'setup', 'accel'],
  [/^COMPASS_/u, 'setup', 'compass'],
  [/^(?:RCMAP_|RC\d+_(?:MIN|MAX|TRIM|REVERSED))/u, 'setup', 'radio'],
  [/^MOT_(?:PWM_TYPE|SPIN_(?:ARM|MIN|MAX))$/u, 'setup', 'motors'],
  [/^SERIAL\d+_(?:PROTOCOL|BAUD)$/u, 'setup', 'serial'],
  [/^(?:ATC_(?:RAT_|ANG_|ACC_|RATE_|INPUT_TC)|AUTOTUNE_)/u, 'tune', 'rate'],
  [/^(?:INS_HNTCH_|INS_GYRO_FILTER)/u, 'tune', 'filters'],
  [/^(?:PSC_|MOT_THST_HOVER$|MOT_HOVER_LEARN$)/u, 'tune', 'more'],
]

/**
 * The guided page of a parameter.
 *
 * @param id the parameter's name
 * @returns the page, or null when no page sets it
 */
export function guideOf(id: string): Guide | null {
  const rule = RULES.find(([pattern]) => pattern.test(id))

  return rule ? { screen: rule[1], section: rule[2], path: `/${rule[1]}/${rule[2]}` } : null
}
