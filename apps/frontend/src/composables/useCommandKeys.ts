// The keys of the commands: ONE listener for the whole window that asks the keymap table (lib/app/keymap.ts) which action a key
// press is, and runs the command with that id through the same path as the palette and the buttons (useCommandRunner), with no
// visible element needed. The keys are fixed for now; #20 replaces the table's contents and nothing here changes. Only the
// table's `keymap` entries are listened for here (the others have their own modules, see the table).
import { onBeforeUnmount, onMounted } from 'vue'
import { KEYS, matches } from '@/lib/app/keymap'
import { useCommandRunner } from './useCommandRunner'

/**
 * Makes every key of the keymap table that names a command run that command, from anywhere in the window, for as long as the
 * component that asks is mounted. The listener is on the window in the capture phase and always prevents the default of a key it
 * knows (Ctrl+P is Chromium's print key, and nothing may print); a held key (repeat) is ignored, so a command does not run again
 * and again.
 */
export function useCommandKeys(): void {
  const run = useCommandRunner()
  const onKey = (event: KeyboardEvent) => {
    const key = KEYS.find(candidate => candidate.listens === 'keymap' && matches(event, candidate.actionId))

    if (key !== undefined) {
      event.preventDefault()

      if (!event.repeat) {
        void run(key.actionId)
      }
    }
  }
  onMounted(() => window.addEventListener('keydown', onKey, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
}
