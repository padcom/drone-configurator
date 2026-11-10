// The view of the parameter list: Standard leaves out what the metadata marks as for an expert (ArduPilot's `User: Advanced`),
// Full lists everything. From plain values (no DOM). A parameter the metadata does not classify is in both, so that Standard
// never hides what nobody said was advanced.
import type { Param } from './generated/app'
import type { Metadata, ParamMeta } from './metadata'

/** The key of the settings entry that holds the choice. */
export const VIEW_KEY = 'params.view'

/** What is listed: `standard` or everything. */
export type View = 'standard' | 'full'

/**
 * The view in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns the view; Full for an entry that is missing or is anything else
 */
export function parseView(text: string | undefined): View {
  return text === 'standard' ? 'standard' : 'full'
}

/**
 * Whether the metadata tells the standard parameters from the others (at least one entry has a `User`): without that the
 * choice has nothing to choose between, and the screen does not offer it.
 *
 * @param metadata what the metadata says of the parameters
 * @returns true when some parameter has a `User`
 */
export function hasUsers(metadata: Metadata): boolean {
  return [...metadata.values()].some(meta => meta.user !== undefined)
}

/**
 * Whether a parameter is listed in a view.
 *
 * @param meta what the metadata says of the parameter, if anything
 * @param view the view
 * @returns true for every parameter in Full, and in Standard for those that are not marked advanced
 */
export function inView(meta: ParamMeta | undefined, view: View): boolean {
  return view === 'full' || meta?.user !== 'advanced'
}

/**
 * The parameters a view lists.
 *
 * @param params every parameter
 * @param metadata what the metadata says of them
 * @param view the view
 * @returns the parameters, in their order (all of them in Full)
 */
export function inViewOf(params: Param[], metadata: Metadata, view: View): Param[] {
  return view === 'full' ? params : params.filter(param => inView(metadata.get(param.id), view))
}
