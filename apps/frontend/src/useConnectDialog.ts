// Whether the Connect dialog is open: one flag the top bar (which opens it) and the dialog (which closes itself) share.
import { type Ref, ref } from 'vue'

/** The open state of the Connect dialog. */
export interface ConnectDialog {
  /** True while the dialog is shown. */
  open: Ref<boolean>
  /** Shows it. */
  show: () => void
  /** Closes it. */
  hide: () => void
}

const open = ref(false)

const shared: ConnectDialog = {
  open,
  show: () => {
    open.value = true
  },
  hide: () => {
    open.value = false
  },
}

/**
 * The Connect dialog's open state, shared by the whole application.
 *
 * @returns the state and how to change it
 */
export function useConnectDialog(): ConnectDialog {
  return shared
}
