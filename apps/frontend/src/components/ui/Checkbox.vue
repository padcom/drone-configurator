<template>
  <label class="kit-check">
    <input v-model="model" type="checkbox" v-bind="$attrs">
    <span><slot /></span>
  </label>
</template>

<script setup lang="ts">
// A native checkbox with its label around it, so a click on the words works too. All the attributes (`disabled`, `name`,
// `aria-*`) go to the checkbox, not to the label, and so do `class` and `style`: to lay a checkbox out, put it in an
// element of your own.
defineOptions({ inheritAttrs: false })

const model = defineModel<boolean>({ default: false })
</script>
