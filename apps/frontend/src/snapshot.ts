// Parameter snapshots: a vehicle's parameters saved as JSON, and what loading one would change.
// Nothing here writes: the configurator applies only the changes the user picked and confirmed.
import type { Param, VehicleInfo } from './generated/app'
import { validateDraft } from './configurator'

export const FORMAT = 'drone-configurator/params'
export const VERSION = 1

export interface Snapshot {
  format: typeof FORMAT
  version: typeof VERSION
  /** When it was saved (ISO 8601). */
  savedAt: string
  vehicle?: VehicleInfo
  params: Pick<Param, 'id' | 'kind' | 'type' | 'value'>[]
}

/**
 * The parameters as a snapshot.
 *
 * @param params what the vehicle reported
 * @param vehicle the vehicle they're from
 * @param now when (for tests)
 * @returns the snapshot as JSON text
 */
export function saveSnapshot(params: Param[], vehicle: VehicleInfo | undefined, now = new Date()): string {
  const snapshot: Snapshot = {
    format: FORMAT,
    version: VERSION,
    savedAt: now.toISOString(),
    ...(vehicle ? { vehicle } : {}),
    params: params.map(({ id, kind, type, value }) => ({ id, kind, type, value })),
  }

  return JSON.stringify(snapshot, null, 2) + '\n'
}

/** One parameter a snapshot would change, or why it can't. */
export interface Change {
  id: string
  from: number | null
  to: number
  /** Why it won't be written (unknown here, another type, an invalid value), or null. */
  problem: string | null
}

export interface Review {
  snapshot: Snapshot
  /** Parameters whose values differ (and ones that can't be applied, with why). */
  changes: Change[]
  /** How many are the same as on the vehicle already. */
  unchanged: number
  /** A different vehicle type or autopilot than the one connected, if so. */
  vehicleWarning: string | null
}

/**
 * Reads a snapshot.
 *
 * @param text the file's text
 * @returns the snapshot, or why it isn't one
 */
export function parseSnapshot(text: string): Snapshot | string {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return 'not JSON'
  }
  const s = data as Partial<Snapshot>
  if (s?.format !== FORMAT) {
    return 'not a Drone Configurator parameter snapshot'
  }
  if (s.version !== VERSION) {
    return `snapshot version ${String(s.version)} (this app reads version ${VERSION})`
  }
  const ok = Array.isArray(s.params) && s.params.every(p => typeof p?.id === 'string' && (p.kind === 'int' || p.kind === 'real')
    && typeof p.type === 'string' && typeof p.value === 'number')

  return ok ? s as Snapshot : 'its parameters are malformed'
}

/**
 * What loading `snapshot` would change on a vehicle with `params`.
 *
 * @param snapshot the snapshot
 * @param params the vehicle's parameters now
 * @param vehicle the connected vehicle
 * @returns the review
 */
export function review(snapshot: Snapshot, params: Param[], vehicle: VehicleInfo | undefined): Review {
  const byId = new Map(params.map(p => [p.id, p]))
  const changes: Change[] = []
  let unchanged = 0
  for (const s of snapshot.params) {
    const current = byId.get(s.id)
    if (!current) {
      changes.push({ id: s.id, from: null, to: s.value, problem: 'not on this vehicle' })
    } else if (current.kind !== s.kind || current.type !== s.type) {
      changes.push({ id: s.id, from: current.value, to: s.value, problem: `${s.type} in the snapshot, ${current.type} on the vehicle` })
    } else if (current.value === s.value) {
      unchanged += 1
    } else {
      changes.push({ id: s.id, from: current.value, to: s.value, problem: validateDraft(current, String(s.value)) })
    }
  }
  const was = snapshot.vehicle
  const vehicleWarning = was && vehicle && (was.type !== vehicle.type || was.autopilot !== vehicle.autopilot)
    ? `saved from a ${was.type} (${was.autopilot}); this is a ${vehicle.type} (${vehicle.autopilot})`
    : null

  return { snapshot, changes, unchanged, vehicleWarning }
}
