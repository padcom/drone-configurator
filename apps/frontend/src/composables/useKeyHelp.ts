// Whether the help of the keys is open: one flag the command that opens it and the dialog (which closes itself) share.
import { type Ref, ref } from 'vue'

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
 * The help of the keys' open state, shared by the whole application.
 *
 * @returns the state and how to change it
 */
export function useKeyHelp(): KeyHelp {
  return shared
}
