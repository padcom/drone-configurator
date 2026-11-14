// The settings about the parameter metadata file: where the user last loaded it from, and whether it is loaded again when the
// application starts. Both are entries of the settings document (`ui` entries), so a settings file written before them has
// neither, and then the load at start is ON with nothing to load.

/** The key of the entry that holds the path of the metadata file, as the user wrote or chose it ('' or nothing: none). */
export const METADATA_PATH_KEY = 'metadata.path'

/** The key of the entry that holds the switch "Load the parameter metadata when the application starts": `on` or `off`. */
export const METADATA_AUTOLOAD_KEY = 'metadata.autoload'

/**
 * Whether the metadata is loaded at start.
 *
 * @param text what the settings hold under the switch's key, if anything
 * @returns false only when the user turned it off: a missing entry (an install from before it) is the default, on
 */
export function autoloadOn(text: string | undefined): boolean {
  return text !== 'off'
}

/**
 * Whether the backend reads a file of this name at start: a `.json` file (the dialog offers those; a name that got through it
 * some other way is loaded, and its path is not kept).
 *
 * @param path the path
 * @returns true when its name ends in `.json`
 */
export function readableAtStart(path: string): boolean {
  return path.toLowerCase().endsWith('.json')
}

/**
 * The path to load at start.
 *
 * @param path what the settings hold under the path's key, if anything
 * @param autoload what the settings hold under the switch's key, if anything
 * @returns the path, or null when nothing is to be loaded (the switch is off, or there is no path)
 */
export function pathToLoad(path: string | undefined, autoload: string | undefined): string | null {
  const trimmed = (path ?? '').trim()

  return autoloadOn(autoload) && trimmed !== '' ? trimmed : null
}
