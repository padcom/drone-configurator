<template>
  <button class="kit-button" :class="{ primary: variant === 'primary' }" :type="type"><slot /></button>
</template>

<script setup lang="ts">
// A native button: focus, Enter and Space, and `disabled` come from the browser. `disabled`, `title` and the like fall
// through to it. The type is `button` unless said otherwise, so that a button in a form does not submit by accident.
withDefaults(defineProps<{
  /** `primary` for the one action of a place that the user is most likely to want. */
  variant?: 'default' | 'primary'
  /** What the button does in a form. */
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'default', type: 'button' })
</script>
