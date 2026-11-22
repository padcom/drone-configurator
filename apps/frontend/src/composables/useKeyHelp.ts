// Whether the help of the keys is open: one flag the command that opens it and the dialog (which closes itself) share.
import { type Ref, ref } from 'vue'
import { otherDialogOpen } from './useCommandPalette'

/** The open state of the help of the keys. */
export interface KeyHelp {
  /** True while the help is shown. */
  open: Ref<boolean>
  /** Shows it. */
  show: () => void
  /** Closes it. */
  hide: () => void
}

const open = ref(false)

const shared: KeyHelp = {
  open,
  show: () => {
    open.value = true
  },
  hide: () => {
    open.value = false
  },
}

/**
 * Closes the help if it is open; opens it unless another dialog is open (a confirmation, the palette, Connect): a hold that is
 * in progress must not be covered. What the command "Show the keyboard shortcuts" does.
 */
export function toggleKeyHelpUnlessCovered(): void {
  if (open.value) {
    shared.hide()
  } else if (!otherDialogOpen()) {
    shared.show()
  }
}

/**
 * The help of the keys' open state, shared by the whole application.
 *
 * @returns the state and how to change it
 */
export function useKeyHelp(): KeyHelp {
  return shared
}
