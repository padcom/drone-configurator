<template>
  <label class="kit-check">
    <input v-model="model" type="checkbox" v-bind="$attrs">
    <span><slot /></span>
  </label>
</template>

<script setup lang="ts">
// A native checkbox with its label around it, so a click on the words works too. Attributes (`disabled`, `name`) go to
// the checkbox, not to the label.
defineOptions({ inheritAttrs: false })

const model = defineModel<boolean>({ default: false })
</script>
