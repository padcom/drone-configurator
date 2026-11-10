<template>
  <label class="kit-tick" :class="{ unlocked: model }">
    <input v-model="model" type="checkbox">
    <span><slot /></span>
  </label>
</template>

<script setup lang="ts">
// A tick that unlocks what is next to it: a bench test that spins a motor stays locked until the user ticks "The
// propellers are off". It is drawn in the caution colours while locked and the good ones when unlocked; the caller
// disables the controls while it is not ticked, and says in words what is locked (the colour only adds to them).
const model = defineModel<boolean>({ default: false })
</script>
