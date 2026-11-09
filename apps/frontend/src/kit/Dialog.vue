<template>
  <dialog
    ref="dialog"
    class="kit-dialog"
    aria-modal="true"
    :aria-labelledby="`${uid}-title`"
    :aria-describedby="`${uid}-body`"
    @cancel.prevent="emit('close')"
    @close="closed"
    @keydown.tab="trap"
  >
    <h2 :id="`${uid}-title`" class="kit-dialog-title">{{ title }}</h2>
    <div :id="`${uid}-body`" class="kit-dialog-body"><slot /></div>
    <div class="kit-dialog-actions"><slot name="actions" /></div>
  </dialog>
</template>

<script setup lang="ts">
// A modal dialog over the native `<dialog>`: the page behind it is inert, Escape asks to close (the `close` event: the
// owner decides, usually by removing the dialog), and when it goes the focus returns to what had it before. The browser
// keeps Tab inside the dialog but lets it reach the browser's own UI; the explicit trap wraps it round instead.
// The element with `data-initial-focus` gets the focus first (else the first control); give it to the safe choice.
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineProps<{
  /** The heading, and the dialog's accessible name. */
  title: string
}>()

const emit = defineEmits<{
  /** Escape was pressed, or the browser closed the dialog: the owner removes it (or, for Escape, may keep it open). */
  close: []
}>()

const uid = useId()
const dialog = ref<HTMLDialogElement | null>(null)
let opener: Element | null = null
let going = false

/** The dialog was closed (by the browser, for instance Escape pressed a second time): the owner is told. */
function closed(): void {
  if (!going) {
    emit('close')
  }
}

const FOCUSABLE = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Where Tab goes from `active` among `controls`: round the ends, and nowhere (undefined) in the middle, where the
 * browser's own order is right. A focus that is outside the dialog is brought back in.
 *
 * @param controls the dialog's controls, in order
 * @param active the control that has the focus
 * @param backwards whether Shift is held
 * @returns the control to move to, or undefined to leave Tab alone
 */
function wrapped(controls: HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | undefined {
  const [leaving, entering] = backwards ? [controls[0], controls.at(-1)] : [controls.at(-1), controls[0]]
  const strayed = !controls.includes(active as HTMLElement)

  return strayed || active === leaving ? entering : undefined
}

/**
 * Focuses an element, if it can take the focus.
 *
 * @param element the element
 * @returns true when it has the focus now
 */
function focused(element: HTMLElement): boolean {
  element.focus()

  return !element.matches(':disabled') && document.activeElement === element
}

/**
 * Focuses the section (or form, or main) around an element that cannot take the focus.
 *
 * @param element the element
 */
function focusAround(element: HTMLElement): void {
  const around = element.closest<HTMLElement>('section, form, main')
  if (around) {
    around.tabIndex = -1
    around.focus()
  }
}

/**
 * Gives the focus back to what had it before the dialog opened, if that is still on the page. If that cannot take it
 * (the write that the dialog confirmed has disabled the button that opened it), the section around it does, so the
 * focus is not lost to the page.
 *
 * @param element the element that had the focus
 */
function giveBack(element: Element | null): void {
  if (element instanceof HTMLElement && element.isConnected && !focused(element)) {
    focusAround(element)
  }
}

/**
 * Keeps Tab inside the dialog.
 *
 * @param event the key event
 */
function trap(event: KeyboardEvent): void {
  const controls = [...dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []]
  const target = wrapped(controls, document.activeElement, event.shiftKey)
  if (target) {
    event.preventDefault()
    target.focus()
  }
}

onMounted(() => {
  opener = document.activeElement
  dialog.value?.showModal()
  dialog.value?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
})

onBeforeUnmount(() => {
  going = true
  dialog.value?.close()
  // Not before the page has settled: what opened the dialog may be disabled by what the dialog confirmed (the answer
  // is passed on, and only then does the write start and disable the button), and a button that is disabled while it
  // has the focus loses it. A task later all of that has happened.
  const back = opener
  setTimeout(() => giveBack(back), 0)
})
</script>
