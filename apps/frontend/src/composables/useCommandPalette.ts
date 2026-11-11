// Whether the command palette is open: one flag that the command "Show command palette" (run by its key, Ctrl+P) and the
// palette (which closes itself) share.
import { type Ref, ref } from 'vue'

/** The open state of the command palette. */
export interface CommandPaletteState {
  /** True while the palette is shown. */
  open: Ref<boolean>
  /** Shows it. */
  show: () => void
  /** Closes it. */
  hide: () => void
  /** Shows it if it is closed, closes it if it is open. */
  toggle: () => void
}

const open = ref(false)

const shared: CommandPaletteState = {
  open,
  show: () => {
    open.value = true
  },
  hide: () => {
    open.value = false
  },
  toggle: () => {
    open.value = !open.value
  },
}

/**
 * Whether a dialog other than the palette is open (the Connect dialog, a confirmation): the palette does not open over one, and
 * a hold that is in progress must not be covered.
 *
 * @returns true when a modal dialog is open
 */
function otherDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}

/** Closes the palette if it is open; opens it unless another dialog is open. What the command "Show command palette" does. */
export function toggleUnlessCovered(): void {
  if (shared.open.value) {
    shared.hide()
  } else if (!otherDialogOpen()) {
    shared.show()
  }
}

/**
 * The palette's open state, shared by the whole application.
 *
 * @returns the state and how to change it
 */
export function useCommandPalette(): CommandPaletteState {
  return shared
}
