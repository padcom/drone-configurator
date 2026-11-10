<template>
  <button class="kit-button" :class="variant === 'default' ? undefined : variant" :type="type"><slot /></button>
</template>

<script setup lang="ts">
// A native button: focus, Enter and Space, and `disabled` come from the browser. `disabled`, `title` and the like fall
// through to it. The type is `button` unless said otherwise, so that a button in a form does not submit by accident.
//
// The variants are the design's: the default is an outline (secondary), `primary` is the one action of a place that the
// user is most likely to want (cyan), and `flight` is an action on the vehicle in flight (amber, bold).
withDefaults(defineProps<{
  /** How it is drawn. */
  variant?: 'default' | 'primary' | 'flight'
  /** What the button does in a form. */
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'default', type: 'button' })
</script>
