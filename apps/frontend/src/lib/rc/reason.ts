// The words for a reason the RC control did not begin or ended, as keys of the interface: a reason that names a problem of the
// vehicle with the mapping (`vehicle.range.3`, from `useRcControl`) is said with the words of Settings' line for that problem,
// so that the Fly line says what to fix; any other reason is `rc.reason.<code>`.

/** What a reason is said with: a message of the interface, and the values in it. */
export interface ReasonWords {
  /** The message's key. */
  key: string
  /** The values in it. */
  values: Record<string, unknown>
}

/** A reason that names a problem of the vehicle with the mapping: `vehicle.<problem>.<channel>`. */
const VEHICLE_PROBLEM = /^vehicle\.(?<problem>[a-z]+)\.(?<channel>\d+)$/u

/**
 * The words for a problem of the vehicle with the mapping.
 *
 * @param parts the parts of the reason: the problem's code (`unknown`, `range`, `arm`, `zone`, `centre`), and the channel it is
 * about (0 for the vehicle as a whole)
 * @param parts.problem the problem's code
 * @param parts.channel the channel
 * @returns the message with Settings' line for the problem in it
 */
function vehicleWords(parts: { problem: string, channel: string }): ReasonWords {
  const { problem, channel } = parts
  const whole = problem === 'unknown' && channel === '0'

  return {
    key: 'rc.reason.vehicleDetail',
    values: { detail: { key: `settings.rc.issue.vehicle.${whole ? 'unknownAll' : problem}`, values: { channel } } },
  }
}

/**
 * The message a reason is said with.
 *
 * @param code the reason's code
 * @returns the message, and the values in it; `detail` is another message (key and values) when the reason names a problem
 */
export function reasonWords(code: string): ReasonWords {
  const groups = VEHICLE_PROBLEM.exec(code)?.groups

  if (groups === undefined) {
    return { key: `rc.reason.${code}`, values: {} }
  }

  // (the pattern has both groups, whenever it matches)
  return vehicleWords(groups as { problem: string, channel: string })
}
