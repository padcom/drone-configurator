// The keys of the commands: ONE listener for the whole window that asks the keymap (lib/app/keymap.ts) which action a
// key press is, and runs the command with that id through the same path as the palette and the buttons
// (useCommandRunner), with no visible element needed. Because it is that path, a key can never do what the button would
// not: a command that must be confirmed (it moves the vehicle, changes how it flies, or erases) asks first, whichever
// way it was asked for. The keys are the user's (they are told to the keymap here, at start, and again when the
// settings change). Only the keymap's own entries are listened for here (the others have their own modules, see the
// table).
import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { Chord } from '@/lib/app/chords'
import { currentKeys, firesWhileTyping, isTypingTarget, matches, setBindings } from '@/lib/app/keymap'
import { useCommandRunner } from './useCommandRunner'
import { useKeyBindings } from './useKeyBindings'

/**
 * Whether a key that was pressed may do its command where the focus is: a key that types is left to the field the focus is in;
 * Ctrl keys and the function keys (F1) stay global.
 *
 * @param key the key of the keymap
 * @param event the press
 * @returns true when it may
 */
function mayFire(key: Chord, event: KeyboardEvent): boolean {
  return firesWhileTyping(key) || !isTypingTarget(event.target)
}

/**
 * Makes every key of the keymap that names a command run that command, from anywhere in the window, for as long as the
 * component that asks is mounted. The listener is on the window in the capture phase and always prevents the default of a key it
 * knows (Ctrl+P is Chromium's print key, and nothing may print); a held key (repeat) is ignored, so a command does not run again
 * and again.
 */
export function useCommandKeys(): void {
  const run = useCommandRunner()
  const { overrides } = useKeyBindings()
  const onKey = (event: KeyboardEvent) => {
    const key = currentKeys().find(candidate => candidate.listens === 'keymap' && matches(event, candidate.actionId))

    if (key !== undefined && mayFire(key, event)) {
      event.preventDefault()

      if (!event.repeat) {
        void run(key.actionId)
      }
    }
  }

  watch(overrides, chosen => setBindings(chosen), { immediate: true })
  onMounted(() => window.addEventListener('keydown', onKey, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
}
