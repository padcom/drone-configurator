<template>
  <div class="kit-toasts" role="region" :aria-label="t('toast.region')">
    <div
      v-for="toast in toasts.visible.value"
      :key="toast.key"
      class="kit-toast"
      :class="`sev-${toast.severity}`"
      :role="toast.severity === 'error' ? 'alert' : 'status'"
      @mouseenter="toasts.pause(toast.key)"
      @mouseleave="toasts.resume(toast.key)"
      @focusin="toasts.pause(toast.key)"
      @focusout="left($event, toast.key)"
    >
      <Icon class="glyph" :name="GLYPHS[toast.severity]" />
      <span class="text">{{ toast.text }}</span>
      <span v-if="toast.count > 1" class="count">{{ t('toast.count', { count: toast.count }) }}</span>
      <button type="button" class="dismiss" :aria-label="t('toast.dismiss')" @click="toasts.dismiss(toast.key)">
        <Icon name="close" />
      </button>
    </div>
    <p v-if="toasts.waiting.value > 0" class="more">{{ t('toast.waiting', { count: toasts.waiting.value }) }}</p>
  </div>
</template>

<script setup lang="ts">
// The toasts that are shown (toasts.ts), a few at a time in the corner. The region is always there, so that what comes up in
// it is read out: a status politely, an error at once. A toast stays while the pointer is on it or the focus is in it (so it
// can be read, and its button reached), and goes after its time. The words are the vehicle's or the app's, shown as text.
import { useI18n } from 'vue-i18n'
import Icon from './kit/Icon.vue'
import { type Severity, type Toasts, useToasts } from './toasts'

const props = withDefaults(defineProps<{
  /** The queue to show: the application's unless a test or the gallery gives its own. */
  queue?: Toasts
}>(), { queue: undefined })

const { t } = useI18n()
const toasts = props.queue ?? useToasts()

/** The glyph of each severity: a tick, a warning sign, a cross (so the colour is never alone). */
const GLYPHS = { success: 'check', warning: 'warning', error: 'close' } as const satisfies Record<Severity, string>

/**
 * The focus left something in a toast: its time runs again unless the focus only moved to another part of the same toast.
 *
 * @param event the focus event
 * @param key the toast's number
 */
function left(event: FocusEvent, key: number): void {
  const toast = event.currentTarget as HTMLElement
  if (!toast.contains(event.relatedTarget as Node | null)) {
    toasts.resume(key)
  }
}
</script>
