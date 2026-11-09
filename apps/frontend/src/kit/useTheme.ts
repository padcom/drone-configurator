// The theme: light, dark, or whatever the system asks for. The choice is set on the root element as `data-theme`
// (tokens.css reads it); "system" removes it, and the page follows `prefers-color-scheme`. It is kept in memory only
// until the settings exist (#19): a new session starts on the system's theme.
import { type ComputedRef, type Ref, computed, readonly, ref } from 'vue'

/** What the user chose. */
export type ThemeChoice = 'system' | 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

const choice = ref<ThemeChoice>('system')
const systemDark = ref(false)
let following = false

/** Starts following the system's preference, once (a page without `matchMedia`, as in a test, stays light). */
function followSystem(): void {
  if (following || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }
  following = true
  const query = window.matchMedia(DARK_QUERY)
  systemDark.value = query.matches
  query.addEventListener('change', event => {
    systemDark.value = event.matches
  })
}

/**
 * Puts the choice on the root element: `light` and `dark` as `data-theme`, `system` as no attribute.
 *
 * @param next what the user chose
 */
function apply(next: ThemeChoice): void {
  const root = document.documentElement
  if (next === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', next)
  }
}

/** The theme state and how to change it. */
export interface Theme {
  /** What the user chose. */
  choice: Readonly<Ref<ThemeChoice>>
  /** The theme in effect: the choice, or the system's preference when the choice is `system`. */
  effective: ComputedRef<'light' | 'dark'>
  /** Chooses a theme and applies it at once. */
  set: (next: ThemeChoice) => void
}

/**
 * The theme, shared by the whole application.
 *
 * @returns the choice, the theme in effect, and a way to change it
 */
export function useTheme(): Theme {
  followSystem()

  return {
    choice: readonly(choice),
    effective: computed(() => {
      if (choice.value !== 'system') {
        return choice.value
      }

      return systemDark.value ? 'dark' : 'light'
    }),
    set(next) {
      choice.value = next
      apply(next)
    },
  }
}
