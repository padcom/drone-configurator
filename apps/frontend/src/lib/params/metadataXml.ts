// ArduPilot's parameter definitions of a released version, `apm.pdef.xml` (what Tools/autotest/param_metadata/xmlemit.py
// writes, and what ArduPilot's server keeps for each version: the server has no JSON of a released version). The file is
// downloaded at run time (the backend's `metadata.fetch`), never bundled: the data set is GPL.
//
//   <paramfile><vehicles><parameters name="ArduCopter">
//     <param humanName="RTL altitude" name="ArduCopter:RTL_ALT" documentation="…" user="Standard">
//       <field name="Range">30 300000</field> <field name="Units">cm</field> <field name="Increment">1</field>
//       <field name="RebootRequired">True</field>
//       <values><value code="0">Disabled</value></values> <bitmask><bit code="0">Roll</bit></bitmask>
//     </param></parameters></vehicles>
//   <libraries><parameters name="SERVO"><param name="SERVO_RATE" …/></parameters></libraries></paramfile>
//
// A vehicle's own parameters are named with the vehicle in front (`ArduCopter:RTL_ALT`), a library's are not. What is kept is
// what the JSON reader keeps (metadata.ts), with the same meaning: the human name is the short description, the documentation the
// long one; when a name is in more than one group the first is kept.
import type { Metadata, ParamMeta } from './metadata'

/**
 * A number written as text.
 *
 * @param text the text, if any
 * @returns the number, or undefined when it is not a finite one
 */
function numberOf(text: string | undefined): number | undefined {
  const number = /\d/u.test(text ?? '') ? Number(text) : Number.NaN

  return Number.isFinite(number) ? number : undefined
}

/**
 * The fields of a parameter (`<field name="…">text</field>`), by name.
 *
 * @param param the parameter's element
 * @returns the text of each field
 */
function fieldsOf(param: Element): Map<string, string> {
  const fields = new Map<string, string>()
  for (const field of param.getElementsByTagName('field')) {
    fields.set(field.getAttribute('name') ?? '', field.textContent ?? '')
  }

  return fields
}

/**
 * Names by code, from the children of one element (`<values><value code="0">…</value></values>`).
 *
 * @param param the parameter's element
 * @param list the element that holds them (`values`, `bitmask`)
 * @returns the names by code, or undefined when there are none
 */
function namesOf(param: Element, list: string): Record<string, string> | undefined {
  const entries = [...param.getElementsByTagName(list)[0]?.children ?? []]
    .map(item => [item.getAttribute('code') ?? '', item.textContent ?? ''] as const)
    .filter(([code]) => code !== '')

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * A flag field: written as the text "True".
 *
 * @param text the field's text, if the parameter has it
 * @returns whether it is set, or undefined when the file does not say
 */
function flagOf(text: string | undefined): boolean | undefined {
  return text === undefined ? undefined : text.trim() === 'True'
}

/**
 * Who a parameter is for.
 *
 * @param text the `user` attribute
 * @returns `standard` or `advanced`, and undefined for anything else
 */
function userOf(text: string | null): ParamMeta['user'] {
  const lower = text?.trim().toLowerCase()

  return lower === 'standard' || lower === 'advanced' ? lower : undefined
}

/**
 * A text attribute that says something.
 *
 * @param param the parameter's element
 * @param name the attribute
 * @returns its value, or undefined when it is missing or empty
 */
function textOf(param: Element, name: string): string | undefined {
  const value = param.getAttribute(name)

  return value === null || value === '' ? undefined : value
}

/**
 * The range field: two numbers with a space between.
 *
 * @param text the field's text, if any
 * @returns the low and the high end, each undefined when it is not a number
 */
function rangeOf(text: string | undefined): { min?: number, max?: number } {
  const [low, high] = (text ?? '').trim().split(/\s+/u)

  return { min: numberOf(low), max: numberOf(high) }
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
 * One parameter.
 *
 * @param param the parameter's element
 * @returns what is known of it
 */
function paramOf(param: Element): ParamMeta {
  const fields = fieldsOf(param)
  const name = textOf(param, 'humanName')
  const text = textOf(param, 'documentation')

  return compact({
    description: name ?? text,
    longDescription: name ? text : undefined,
    units: fields.get('Units') || undefined,
    ...rangeOf(fields.get('Range')),
    increment: numberOf(fields.get('Increment')),
    values: namesOf(param, 'values'),
    bits: namesOf(param, 'bitmask'),
    rebootRequired: flagOf(fields.get('RebootRequired')),
    readOnly: flagOf(fields.get('ReadOnly')),
    volatile: flagOf(fields.get('Volatile')),
    user: userOf(param.getAttribute('user')),
  })
}

/**
 * The name of a parameter without the vehicle in front of it (`ArduCopter:RTL_ALT` is `RTL_ALT`).
 *
 * @param name the `name` attribute
 * @returns the parameter's id
 */
function idOf(name: string): string {
  return name.slice(name.indexOf(':') + 1)
}

/**
 * Whether a text is ArduPilot's XML definition file.
 *
 * @param text the text
 * @returns true when it holds a `<paramfile>`
 */
export function isPdefXml(text: string): boolean {
  return text.trimStart().startsWith('<') && text.includes('<paramfile>')
}

/**
 * Keeps a parameter, unless one of its name was kept already (the first group that has a name keeps it).
 *
 * @param out the metadata so far
 * @param param the parameter's element
 */
function keep(out: Metadata, param: Element): void {
  const id = idOf(param.getAttribute('name') ?? '')
  if (id !== '' && !out.has(id)) {
    out.set(id, paramOf(param))
  }
}

/**
 * Reads ArduPilot's XML definition file.
 *
 * @param text the file's text
 * @returns the metadata by parameter name (empty when there is no parameter, or the XML is not well formed)
 */
export function parsePdefXml(text: string): Metadata {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const out: Metadata = new Map()
  const params = doc.getElementsByTagName('parsererror').length > 0 ? [] : doc.getElementsByTagName('param')
  for (const param of params) {
    keep(out, param)
  }

  return out
}

