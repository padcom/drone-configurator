<template>
  <button
    class="kit-toggle"
    type="button"
    role="switch"
    :aria-checked="model ? 'true' : 'false'"
    @click="model = !model"
  >
    <span class="track" aria-hidden="true"><span class="thumb" /></span>
    <span><slot /></span>
  </button>
</template>

<script setup lang="ts">
// A switch: an on-off setting that takes effect at once (a checkbox is for a choice that is confirmed later). It is a
// native button with the `switch` role, so Space and Enter work, it is in the tab order, and `disabled` turns it off.
const model = defineModel<boolean>({ default: false })
</script>
