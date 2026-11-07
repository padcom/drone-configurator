// Optional parameter metadata: descriptions, units, ranges and named values, loaded from a file.
// Nothing is invented: without metadata a parameter is only its wire type, and edits are checked
// against that type alone. With metadata, edits are also checked against its range and values.
//
// Format (JSON):
//   { "format": "drone-configurator/param-metadata", "version": 1,
//     "params": { "RTL_ALT": { "description": "…", "units": "cm", "min": 200, "max": 300000 },
//                 "FENCE_ENABLE": { "values": { "0": "Disabled", "1": "Enabled" } } } }
// A converter from an autopilot's own metadata (ArduPilot's apm.pdef files) can produce it.

export const METADATA_FORMAT = 'drone-configurator/param-metadata'

export interface ParamMeta {
  description?: string
  units?: string
  min?: number
  max?: number
  /** Allowed values and their names. */
  values?: Record<string, string>
}

export type Metadata = Map<string, ParamMeta>

/**
 * Reads a metadata file.
 *
 * @param text the file's text
 * @returns the metadata by parameter name, or why it isn't metadata
 */
export function parseMetadata(text: string): Metadata | string {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return 'not JSON'
  }
  const d = data as { format?: unknown, version?: unknown, params?: unknown }
  if (d?.format !== METADATA_FORMAT) {
    return 'not a Drone Configurator metadata file'
  }
  if (d.version !== 1) {
    return `metadata version ${String(d.version)} (this app reads version 1)`
  }
  if (typeof d.params !== 'object' || d.params === null) {
    return 'it has no params'
  }
  const out: Metadata = new Map()
  for (const [id, raw] of Object.entries(d.params as Record<string, unknown>)) {
    const m = raw as Record<string, unknown>
    const meta: ParamMeta = {}
    if (typeof m.description === 'string') meta.description = m.description
    if (typeof m.units === 'string') meta.units = m.units
    if (typeof m.min === 'number') meta.min = m.min
    if (typeof m.max === 'number') meta.max = m.max
    if (typeof m.values === 'object' && m.values !== null) {
      meta.values = Object.fromEntries(Object.entries(m.values as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    }
    out.set(id, meta)
  }

  return out
}

/**
 * Why `value` breaks `meta`'s range or values, or null.
 *
 * @param meta what's known about the parameter
 * @param value the new value
 * @returns the problem, or null
 */
export function checkMeta(meta: ParamMeta | undefined, value: number): string | null {
  if (!meta) {
    return null
  }
  if (meta.values && Object.keys(meta.values).length > 0 && !(String(value) in meta.values)) {
    const allowed = Object.entries(meta.values).map(([v, name]) => `${v} (${name})`).join(', ')

    return `one of ${allowed}`
  }
  if (meta.min !== undefined && value < meta.min) {
    return `at least ${meta.min}${meta.units ? ` ${meta.units}` : ''}`
  }
  if (meta.max !== undefined && value > meta.max) {
    return `at most ${meta.max}${meta.units ? ` ${meta.units}` : ''}`
  }

  return null
}
