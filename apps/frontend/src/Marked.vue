<template>
  <template v-for="(piece, i) in pieces" :key="i">
    <mark v-if="piece.match">{{ piece.text }}</mark>
    <template v-else>{{ piece.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { highlight } from './paramSearch'

// A text with the words that were searched for marked. Only the rows that are drawn have one, so the cost is that of a screen of
// rows and not of the whole result. The text is shown as text (Vue escapes it).
const props = defineProps<{
  /** What is shown. */
  text: string
  /** The words searched for, in lower case. */
  tokens: string[]
}>()

const pieces = computed(() => highlight(props.text, props.tokens))
</script>
