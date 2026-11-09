// A copy of the chosen theme in the browser's storage, so that the first paint has it. The settings are the truth, and they
// come from the backend after the page is up; without a copy a dark choice on a light system would show a light page for
// a moment at every start. The copy is read before anything is drawn, and is rewritten whenever the settings say a theme.
import type { ThemeName } from './generated/app'

/** Where the copy is kept (versioned like the other stored data). */
export const THEME_KEY = 'drone-configurator:theme:v1'

const THEMES: readonly string[] = ['system', 'light', 'dark']

/** The copy of the theme. */
export interface FirstPaint {
  /** The theme that was kept, or null if none was, or what is there is not a theme. */
  read: () => ThemeName | null
  /** Keeps a theme, or forgets the copy (null: the settings say none). */
  write: (theme: ThemeName | null) => void
}

/**
 * The copy of the theme. Storage may be missing, full or forbidden, and its content is not trusted: whatever goes wrong,
 * the page is drawn in the system's theme until the settings arrive.
 *
 * @param storage localStorage, or null
 * @returns how to read and write it, or null when there is no storage
 */
export function firstPaint(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): FirstPaint | null {
  if (storage === null) {
    return null
  }

  return {
    read() {
      try {
        const stored = storage.getItem(THEME_KEY)

        return stored !== null && THEMES.includes(stored) ? stored as ThemeName : null
      } catch {
        return null
      }
    },
    write(theme) {
      try {
        if (theme === null) {
          storage.removeItem(THEME_KEY)
        } else {
          storage.setItem(THEME_KEY, theme)
        }
      } catch {
        // Storage that cannot be written to: the next start is drawn in the system's theme until the settings arrive.
      }
    },
  }
}
