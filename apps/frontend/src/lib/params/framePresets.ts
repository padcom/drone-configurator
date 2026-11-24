// ArduPilot's frame presets (#41): the parameter files ArduPilot publishes for frames it knows (`Tools/Frame_params` in its
// repository), listed and fetched by the backend (`presets.list`, `presets.fetch`), downloaded at run time and never bundled
// (they are GPL). Here, from plain values (no DOM): which presets a search shows, what the page says about where the list came
// from and why it could not be had, and what a preset would change (the same review as a parameter file's, with the preset as its
// source).
// Nothing here writes.
import { toBackendError } from '@/backend/client'
import type { Param, PresetEntry, PresetsList, VehicleInfo } from '@/generated/app'
import type { Translate } from '@/lib/fly/telemetryCards'
import type { DiffOptions } from './paramDiff'
import { parseParamFile } from './paramFile'
import { reviewFile } from './paramFileReview'
import type { PresetSource, Review } from './snapshot'

export type { PresetSource } from './snapshot'

/**
 * The name of a preset: its file's name without the extension.
 *
 * @param path its path under `Tools/Frame_params`
 * @returns the name
 */
export function presetName(path: string): string {
  const file = path.split('/').at(-1) ?? path

  return file.replace(/\.(?:param|parm|params)$/iu, '')
}

/**
 * The folder of a preset under `Tools/Frame_params`, or '' for one at the top.
 *
 * @param path its path
 * @returns the folder
 */
export function presetFolder(path: string): string {
  const slash = path.lastIndexOf('/')

  return slash < 0 ? '' : path.slice(0, slash)
}

/**
 * Whether a preset is one a search asks for: every word of the search is in its path (the name and the folder), in any case.
 * Underscores and dashes count as spaces, so "x500" and "holybro x500" find "Holybro-X500v2".
 *
 * @param preset the preset
 * @param search what was typed
 * @returns true when it shows
 */
export function presetShows(preset: PresetEntry, search: string): boolean {
  const words = search.toLowerCase().split(/[\s_-]+/u).filter(Boolean)
  const path = preset.path.toLowerCase().replaceAll(/[_-]/gu, ' ')

  return words.every(word => path.includes(word))
}

/**
 * What the page says about where the list came from: the vehicle's firmware tag, or master and why.
 *
 * @param list the list
 * @param translate looks up a message
 * @returns the line
 */
export function refLine(list: PresetsList, translate: Translate): string {
  if (list.pinned) {
    return translate('presets.ref.pinned', { ref: list.ref })
  }

  return list.fallback === 'untagged'
    ? translate('presets.ref.untagged', { ref: list.ref, version: list.version ?? '' })
    : translate('presets.ref.unreleased', { ref: list.ref })
}

/**
 * What the page says about how fresh the list is: from this computer, and when stale, that GitHub could not be asked.
 *
 * @param list the list
 * @param translate looks up a message
 * @returns the line, or '' for a list GitHub gave just now
 */
export function freshnessLine(list: PresetsList, translate: Translate): string {
  if (list.stale) {
    return translate('presets.stale')
  }

  return list.fromCache ? translate('presets.fromCache') : ''
}

/**
 * The time GitHub said it may be asked again, from the message of a refusal (seconds since 1970).
 *
 * @param message the message
 * @returns the time, or null when it did not say
 */
function retryTime(message: string): Date | null {
  const seconds = Number(/^\d{9,}$/u.exec(message.trim())?.[0])

  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null
}

/** The errors that are said without the backend's words: the message of each. */
const PLAIN_ERRORS: Partial<Record<string, string>> = {
  NOT_CONNECTED: 'presets.error.notConnected',
  UNSUPPORTED_VEHICLE: 'presets.error.unsupported',
}

/**
 * That GitHub refuses more requests for now, and until when when it said.
 *
 * @param message the backend's message: when GitHub may be asked again (seconds since 1970), or ''
 * @param translate looks up a message
 * @param locale the language of the page, for the time
 * @returns the words
 */
function limitedError(message: string, translate: Translate, locale: string): string {
  const at = retryTime(message)
  if (!at) {
    return translate('presets.error.limited')
  }

  return translate('presets.error.limitedUntil', { time: at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })
}

/**
 * Why the list or a preset could not be had, in words that say what to do next.
 *
 * @param error what the call threw
 * @param translate looks up a message
 * @param locale the language of the page, for the time
 * @returns the words
 */
export function presetsError(error: unknown, translate: Translate, locale: string): string {
  const { code, message } = toBackendError(error)
  if (code === 'RATE_LIMITED') {
    return limitedError(message, translate, locale)
  }
  const plain = PLAIN_ERRORS[code]

  return plain ? translate(plain) : translate('presets.error.failed', { error: message })
}

/** What a preset is reviewed against: the vehicle's parameters, the vehicle, and the metadata. */
export interface Against {
  /** The vehicle's parameters now. */
  params: Param[]
  /** The connected vehicle. */
  vehicle: VehicleInfo | undefined
  /** The metadata, if loaded. */
  options: DiffOptions
}

/**
 * What applying a preset would change on the vehicle: every parameter of it that differs (one the vehicle does not have is a
 * change that cannot be made, and says why), as a parameter file's review, with the preset as its source.
 *
 * @param text the preset's text, as ArduPilot publishes it
 * @param source the preset
 * @param against the vehicle's parameters, the vehicle and the metadata
 * @returns the review, or null when the text has no parameter lines
 */
export function reviewPreset(text: string, source: PresetSource, against: Against): Review | null {
  const file = parseParamFile(text)
  if (file.entries.length === 0) {
    return null
  }

  return { ...reviewFile(file, against.params, against.vehicle, against.options), source }
}
