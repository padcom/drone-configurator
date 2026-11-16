// The dialog of a change of altitude: whether it is open, and the altitude that was typed (empty until it is opened: the
// dialog proposes the
// altitude the vehicle is at). One flag the command (which opens it) and the dialog (which closes itself) share; nothing is
// sent from here.
import { shallowRef } from 'vue'

const open = shallowRef(false)
const typed = shallowRef('')

/** The change of altitude dialog's state. */
export interface ChangeAltitudeDialog {
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
 * The change of altitude dialog's state, shared by the command and the dialog.
 *
 * @returns the state and what changes it
 */
export function useChangeAltitude(): ChangeAltitudeDialog {
  return {
    open,
    typed,
    show: () => {
      typed.value = ''
      open.value = true
    },
    hide: () => {
      open.value = false
    },
  }
}
