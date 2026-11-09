<template>
  <!-- Focusable by script (F6 moves the focus from pane to pane) and not in the tab order: Tab goes on to what is inside. -->
  <section class="flight-pane" :class="{ collapsed }" :aria-labelledby="titleId" tabindex="-1">
    <header>
      <h2 :id="titleId" :class="{ 'visually-hidden': collapsed }">{{ title }}</h2>
      <Button
        class="toggle"
        :aria-expanded="collapsed ? 'false' : 'true'"
        :aria-controls="bodyId"
        :title="toggleText"
        @click="emit('toggle')"
      >
        <Icon :name="collapsed ? 'plus' : 'minus'" />
        <span class="visually-hidden">{{ toggleText }}</span>
      </Button>
    </header>
    <div :id="bodyId" class="body" :hidden="collapsed"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import Icon from './kit/Icon.vue'

// A pane of the Flight data screen: a title and a button that collapses it to its header (and opens it again), over its
// content. A collapsed pane keeps its header, with the button, however narrow its place is, so it can always be opened;
// its content is hidden but kept, so what is in it stays.
const props = defineProps<{
  /** What the pane is called. */
  title: string
  /** Whether it is collapsed to its header. */
  collapsed: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
const titleId = useId()
const bodyId = useId()
// (Each key is written out, so that the scan of the keys finds both.)
const toggleText = computed(() => {
  const pane = props.title

  return props.collapsed ? t('flight.expand', { pane }) : t('flight.collapse', { pane })
})
</script>
