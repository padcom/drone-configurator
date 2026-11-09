<template>
  <dialog id="confirm" ref="dialog" @close="closed">
    <form method="dialog">
      <p id="question">{{ confirmation?.question }}</p>
      <button value="no">Cancel</button>
      <button value="yes">Write</button>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useConfigurator } from './useConfigurator'

const { confirmation } = useConfigurator()
const dialog = ref<HTMLDialogElement | null>(null)

/** Opens the native modal dialog when a question arrives (answered with the button's value). */
function open() {
  if (confirmation.value && dialog.value && !dialog.value.open) {
    dialog.value.returnValue = ''
    dialog.value.showModal()
  }
}

/** Passes the user's answer on; Escape and Cancel both mean no. */
function closed() {
  confirmation.value?.answer(dialog.value?.returnValue === 'yes')
}

watch(confirmation, open, { flush: 'post' })
onMounted(open)
</script>
