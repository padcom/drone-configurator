// Optional parameter metadata: descriptions, units, ranges, named values and bits, loaded from a file. Nothing is invented:
// without metadata a parameter is only its wire type, and edits are checked against that type alone. With metadata, edits
// are also checked against its range and values.
//
// Two kinds of file are read:
//
// 1. Our own format (JSON, version 1; every field of a parameter is optional):
//   { "format": "drone-configurator/param-metadata", "version": 1,
//     "params": { "RTL_ALT": { "description": "…", "longDescription": "…", "units": "cm", "min": 200, "max": 300000,
//                              "increment": 1, "rebootRequired": false },
//                 "FENCE_ENABLE": { "values": { "0": "Disabled", "1": "Enabled" } },
//                 "ARMING_CHECK": { "bits": { "0": "All", "1": "Barometer" } } } }
//
// 2. ArduPilot's own definitions, `apm.pdef.json` (what Tools/autotest/param_metadata/jsonemit.py writes, and what the
//    ArduPilot site serves per vehicle): { "json": { "version": 0 }, "<group>": { "<NAME>": { "displayName": "…",
//    "description": "…", "Range": { "low": "0", "high": "10" }, "Units": "cm", "Increment": "1", "Values": { "0": "…" },
//    "Bitmask": { "0": "…" }, "RebootRequired": "True", … } } }. Only what is used is kept (the whole file is several
//    megabytes). The display name is the short description, ArduPilot's description is the long one; when a name is in more
//    than one group the first is kept.

export const METADATA_FORMAT = 'drone-configurator/param-metadata'

export interface ParamMeta {
  /** What the parameter is, in a few words. */
  description?: string
  /** The full explanation. */
  longDescription?: string
  units?: string
  min?: number
  max?: number
  /** The step a value moves by. */
  increment?: number
  /** Allowed values and their names. */
  values?: Record<string, string>
  /** The bits of a bitmask and their names, by bit number. */
  bits?: Record<string, string>
  /** Whether a new value only takes effect after the vehicle is restarted. */
  rebootRequired?: boolean
}

export type Metadata = Map<string, ParamMeta>

type Raw = Record<string, unknown>

/**
 * A plain object.
 *
 * @param value anything
 * @returns it as an object, or undefined for anything else (arrays and null included)
 */
function objectOf(value: unknown): Raw | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Raw : undefined
}

/**
 * A text.
 *
 * @param value anything
 * @returns it when it is a non-empty string
 */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * A number, written as a number or as text (ArduPilot writes them as text).
 *
 * @param value anything
 * @returns the number, or undefined when it is not a finite one
 */
function numberOf(value: unknown): number | undefined {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value

  return typeof number === 'number' && Number.isFinite(number) ? number : undefined
}

/**
 * Names by code (values, bits).
 *
 * @param value anything
 * @returns the entries whose name is a text, or undefined when there are none
 */
function namesOf(value: unknown): Record<string, string> | undefined {
  const entries = Object.entries(objectOf(value) ?? {}).filter(([, name]) => typeof name === 'string')

  return entries.length > 0 ? Object.fromEntries(entries) as Record<string, string> : undefined
}

/**
 * What of a parameter is known, without the fields that are not.
 *
 * @param meta the fields, some of them undefined
 * @returns the fields that have a value
 */
function compact(meta: ParamMeta): ParamMeta {
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined)) as ParamMeta
}

/**
 * One parameter of our own format.
 *
 * @param raw what the file has
 * @returns what is known of it
 */
function ownParam(raw: Raw): ParamMeta {
  return compact({
    description: textOf(raw.description),
    longDescription: textOf(raw.longDescription),
    units: textOf(raw.units),
    min: numberOf(raw.min),
    max: numberOf(raw.max),
    increment: numberOf(raw.increment),
    values: namesOf(raw.values),
    bits: namesOf(raw.bits),
    rebootRequired: typeof raw.rebootRequired === 'boolean' ? raw.rebootRequired : undefined,
  })
}

/**
 * One parameter of an ArduPilot definition file.
 *
 * @param raw what the file has
 * @returns what is known of it
 */
function ardupilotParam(raw: Raw): ParamMeta {
  const range = objectOf(raw.Range)
  const name = textOf(raw.displayName)
  const text = textOf(raw.description)

  return compact({
    description: name ?? text,
    longDescription: name ? text : undefined,
    units: textOf(raw.Units),
    min: numberOf(range?.low),
    max: numberOf(range?.high),
    increment: numberOf(raw.Increment),
    values: namesOf(raw.Values),
    bits: namesOf(raw.Bitmask),
    rebootRequired: raw.RebootRequired === undefined ? undefined : raw.RebootRequired === 'True' || raw.RebootRequired === true,
  })
}

/**
 * The parameters of our own format.
 *
 * @param params the file's `params`
 * @returns the metadata by parameter name
 */
function fromOwn(params: Raw): Metadata {
  const out: Metadata = new Map()
  for (const [id, raw] of Object.entries(params)) {
    out.set(id, ownParam(objectOf(raw) ?? {}))
  }

  return out
}

/**
 * The parameters of an ArduPilot definition file: one object of parameters for each vehicle and library.
 *
 * @param file the whole file
 * @returns the metadata by parameter name (the first group that has a name keeps it)
 */
function fromArduPilot(file: Raw): Metadata {
  const out: Metadata = new Map()
  for (const [group, params] of Object.entries(file)) {
    for (const [id, raw] of group === 'json' ? [] : Object.entries(objectOf(params) ?? {})) {
      const param = objectOf(raw)
      if (param && !out.has(id)) {
        out.set(id, ardupilotParam(param))
      }
    }
  }

  return out
}

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
  const d = objectOf(data)
  if (d && typeof objectOf(d.json)?.version === 'number' && d.format === undefined) {
    return fromArduPilot(d)
  }
  if (d?.format !== METADATA_FORMAT) {
    return 'not a Drone Configurator metadata file'
  }
  if (d.version !== 1) {
    return `metadata version ${String(d.version)} (this app reads version 1)`
  }
  const params = objectOf(d.params)

  return params ? fromOwn(params) : 'it has no params'
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
