// The keys of the Parameters screen that work from more than one place: Ctrl+/ goes to the search, Ctrl+Enter from the Value
// field or the list presses "Write N and verify". (The keys of one place, as Up and Down in the list, are with that place.)
// F6 (paneFocus.ts) is another key, and nothing here uses it.
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'

/** What the shortcuts act on. */
export interface ShortcutDeps {
  /** Queues the value in the Value field, if it is settled (what Enter does there). */
  sync: () => void
}

/**
 * Whether a key press is Ctrl with that key alone (Alt and Meta make other shortcuts; Shift too, unless the key is one that
 * needs Shift on some layouts: `/` is Shift+7 on a German keyboard, so Ctrl+Shift+7 reports the key `/` there).
 *
 * @param event the key press
 * @param key the key
 * @param shifted whether the key may be typed with Shift
 * @returns true for Ctrl+key
 */
export function isCtrl(event: KeyboardEvent, key: string, shifted: boolean): boolean {
  const others = [event.altKey, event.metaKey, event.shiftKey && !shifted]

  return event.key === key && event.ctrlKey && !others.some(Boolean)
}

/**
 * Whether the key was pressed in a text field of a dialog, where Ctrl+/ belongs to the dialog.
 *
 * @param target where the key was pressed
 * @returns true for a text field inside a dialog
 */
export function inDialogField(target: EventTarget | null): boolean {
  const field = target instanceof HTMLElement && target.matches('input, textarea, [contenteditable]')

  return field && target.closest('dialog') !== null
}

/**
 * Goes to the search, with its text selected (what Ctrl+/ does, and what choosing the Parameters screen with its command does).
 */
export function focusSearch(): void {
  const search = document.getElementById('filter') as HTMLInputElement | null
  search?.focus()
  search?.select()
}

/**
 * Presses "Write N and verify" (the same question as the button asks), from the Value field or the list. The value that is
 * typed is queued first, as leaving the field would. A button that is disabled does nothing when it is pressed.
 *
 * @param deps what to act on
 */
async function writeQueued(deps: ShortcutDeps): Promise<void> {
  deps.sync()
  await nextTick()
  document.getElementById('write-staged')?.click()
}

/**
 * Whether the key was pressed in the Value field or in the list of parameters.
 *
 * @param target where the key was pressed
 * @returns true if so
 */
function inEditorOrList(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('#edit, #param-list') !== null
}

/**
 * Which shortcut a key press is, where it was pressed.
 *
 * @param event the key press
 * @returns 'search' for Ctrl+/ (anywhere but in a text field of a dialog), 'write' for Ctrl+Enter in the Value field or the
 * list, and undefined for any other key
 */
export function shortcutOf(event: KeyboardEvent): 'search' | 'write' | undefined {
  const found = [
    { shortcut: 'search' as const, pressed: isCtrl(event, '/', true) && !inDialogField(event.target) },
    { shortcut: 'write' as const, pressed: isCtrl(event, 'Enter', false) && inEditorOrList(event.target) },
  ]

  return found.find(candidate => candidate.pressed)?.shortcut
}

/**
 * Makes Ctrl+/ and Ctrl+Enter work, for as long as the screen that asks is mounted (and, when it is kept alive, shown).
 *
 * @param deps what to act on
 */
export function useParamShortcuts(deps: ShortcutDeps): void {
  const onKey = (event: KeyboardEvent) => {
    const action = shortcutOf(event)
    if (action) {
      event.preventDefault()

      // A key held down repeats: the repeats do nothing (a second press of Write would ask the question again).
      if (action === 'search') {
        focusSearch()
      } else if (!event.repeat) {
        void writeQueued(deps)
      }
    }
  }
  const listen = () => window.addEventListener('keydown', onKey)
  const forget = () => window.removeEventListener('keydown', onKey)

  onMounted(listen)
  onActivated(listen)
  onDeactivated(forget)
  onBeforeUnmount(forget)
}
