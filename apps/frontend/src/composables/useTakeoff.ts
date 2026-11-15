// The dialog of a takeoff: whether it is open, and the altitude that was typed (kept from one opening to the next, so that the
// altitude of the last takeoff is what is proposed). One flag the command (which opens it) and the dialog (which closes itself)
// share; nothing is sent from here.
import { shallowRef } from 'vue'
import { TAKEOFF_DEFAULT_M } from '@/lib/fly/takeoff'

const open = shallowRef(false)
const typed = shallowRef(String(TAKEOFF_DEFAULT_M))

/** The takeoff dialog's state. */
export interface TakeoffDialog {
  /** True while the dialog is shown. */
  open: typeof open
  /** What is in the altitude field. */
  typed: typeof typed
  /** Shows it. */
  show: () => void
  /** Closes it. */
  hide: () => void
}

/**
 * The takeoff dialog's state, shared by the command and the dialog.
 *
 * @returns the state and what changes it
 */
export function useTakeoff(): TakeoffDialog {
  return {
    open,
    typed,
    show: () => {
      open.value = true
    },
    hide: () => {
      open.value = false
    },
  }
}
