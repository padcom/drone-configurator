<template>
  <div class="kit-toasts" role="region" :aria-label="t('toast.region')">
    <div
      v-for="group in groups"
      :key="group.role"
      class="kit-toast-group"
      :role="group.role"
      aria-atomic="false"
      aria-relevant="additions text"
    >
      <div
        v-for="toast in group.toasts"
        :key="toast.key"
        class="kit-toast"
        :class="`sev-${toast.severity}`"
        @mouseenter="toasts.pause(toast.key, 'pointer')"
        @mouseleave="toasts.resume(toast.key, 'pointer')"
        @focusin="toasts.pause(toast.key, 'focus')"
        @focusout="left($event, toast.key)"
      >
        <Icon class="glyph" :name="GLYPHS[toast.severity]" />
        <!-- A brief toast is for the eye: what it says is said to the ear by the page (the shell's status), not twice. -->
        <span class="text" :aria-hidden="toast.brief ? 'true' : undefined">{{ toast.text }}</span>
        <!-- Each step of a download is for the eye: what a screen reader hears is the text, when it changes. -->
        <span v-if="toast.progress" class="progress" aria-hidden="true">
          <span class="bar"><span class="fill" :style="{ width: `${percentOf(toast.progress)}%` }" /></span>
          <span v-if="toast.progress.label" class="label">{{ toast.progress.label }}</span>
        </span>
        <span v-if="toast.count > 1" class="count">{{ t('toast.count', { count: toast.count }) }}</span>
        <button
          type="button"
          class="dismiss"
          :aria-label="toast.dismissLabel ?? t('toast.dismiss')"
          :title="toast.dismissLabel ?? undefined"
          @click="toasts.dismiss(toast.key, 'manual')"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
    <p v-if="toasts.waiting.value > 0" class="more">{{ t('toast.waiting', { count: toasts.waiting.value }) }}</p>
  </div>
</template>

<script setup lang="ts">
// The toasts that are shown (toasts.ts), a few at a time in the corner. What is read out is what comes up inside a live region
// that was already there, so two wrappers are always present, even when empty: a polite one (role "status") for successes and
// warnings, and an assertive one (role "alert") for errors. A toast stays while the pointer is on it or the focus is in it (so
// it can be read, and its button reached), and goes after its time. The words are the vehicle's or the app's, shown as text.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { type Severity, type Toast, type ToastProgress, type Toasts, useToasts } from '@/composables/toasts'

const props = withDefaults(defineProps<{
  /** The queue to show: the application's unless a test or the gallery gives its own. */
  queue?: Toasts
}>(), { queue: undefined })

const { t } = useI18n()
const toasts = props.queue ?? useToasts()

/** The glyph of each severity: a tick, a warning sign, a cross (so the colour is never alone). */
const GLYPHS = { info: 'info', success: 'check', warning: 'warning', error: 'close' } as const satisfies Record<Severity, string>

/** The two live regions, always there: errors are announced at once, the rest politely. */
const groups = computed<Array<{ role: 'status' | 'alert', toasts: Toast[] }>>(() => [
  { role: 'status', toasts: toasts.visible.value.filter(toast => toast.severity !== 'error') },
  { role: 'alert', toasts: toasts.visible.value.filter(toast => toast.severity === 'error') },
])

/**
 * How much of a bar is full.
 *
 * @param progress the bar
 * @returns a whole percentage from 0 to 100 (0 for a bar with nothing to do)
 */
function percentOf(progress: ToastProgress): number {
  return progress.max > 0 ? Math.min(100, Math.max(0, Math.round(progress.value / progress.max * 100))) : 0
}

/**
 * The focus left something in a toast: its hold by the focus ends unless the focus only moved to another part of the same toast.
 *
 * @param event the focus event
 * @param key the toast's number
 */
function left(event: FocusEvent, key: number): void {
  const toast = event.currentTarget as HTMLElement
  if (!toast.contains(event.relatedTarget as Node | null)) {
    toasts.resume(key, 'focus')
  }
}
</script>
