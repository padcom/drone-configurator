// Whether the command palette is open: one flag the top bar's button and the Ctrl+P key (which open it) and the palette
// (which closes itself) share.
import { type Ref, onBeforeUnmount, onMounted, ref } from 'vue'
import { matches } from '@/lib/app/keymap'

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

/** Closes the palette if it is open; opens it unless another dialog is open. */
function toggleUnlessCovered(): void {
  if (shared.open.value) {
    shared.hide()
  } else if (!otherDialogOpen()) {
    shared.show()
  }
}

/**
 * Makes Ctrl+P (Cmd+P on a Mac) open the palette from anywhere in the window, and close it when it is open, for as long as the
 * component that asks is mounted. The key is Chromium's print key: the listener is on the window in the capture phase and always
 * prevents the default, so that nothing prints; a held key (repeat) is ignored, so the palette does not flicker.
 */
export function usePaletteKey(): void {
  const onKey = (event: KeyboardEvent) => {
    if (matches(event, 'palette.open')) {
      event.preventDefault()

      if (!event.repeat) {
        toggleUnlessCovered()
      }
    }
  }
  onMounted(() => window.addEventListener('keydown', onKey, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
}

/**
 * The palette's open state, shared by the whole application.
 *
 * @returns the state and how to change it
 */
export function useCommandPalette(): CommandPaletteState {
  return shared
}
