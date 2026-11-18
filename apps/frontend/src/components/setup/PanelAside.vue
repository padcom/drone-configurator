<template>
  <Pane tag="aside" class="setup-aside" :aria-label="t('setup.aside')">
    <!-- At the top, what stops a write (only when something does). -->
    <template v-if="reason" #top>
      <Banner :id="`${idPrefix}-blocked`" tone="warn">{{ reason }}</Banner>
    </template>
    <slot />
    <p :id="`${idPrefix}-status`" class="setup-status" role="status">{{ status }}</p>
    <!-- A write that stopped says which parameters were read back, which were not confirmed, and which were not written. -->
    <ul v-if="outcome.length > 0" :id="`${idPrefix}-outcome`" class="setup-outcome">
      <li v-for="line in outcome" :key="line">{{ line }}</li>
    </ul>
    <!-- At the bottom, fixed: exactly what this writes, and the buttons (a long list scrolls in a box of its own). -->
    <template #bottom>
      <div>
        <h2 class="setup-label">{{ t('setup.writes') }}</h2>
        <ul class="setup-writes">
          <li v-for="id in shown" :key="id" :class="{ missing: panel.missing.value.includes(id) }">
            {{ id }}<span v-if="panel.missing.value.includes(id)"> · {{ t('setup.notOnVehicle') }}</span>
          </li>
        </ul>
      </div>
      <Button
        :id="`${idPrefix}-revert`"
        :disabled="panel.dirty.value.length === 0 || panel.writing.value"
        @click="panel.revert()"
      >
        {{ t('setup.revert') }}
      </Button>
      <Button :id="`${idPrefix}-write`" :disabled="!writable" @click="panel.write()">{{ label }}</Button>
    </template>
  </Pane>
</template>

<script setup lang="ts">
// The side of a Setup page that writes parameters, a pane (components/ui/Pane.vue): at the TOP why nothing can be written now
// (offline, still loading, armed or not known to be disarmed); in the body what the page adds and how the last write went in
// words ("Written and read back", or what the vehicle said); at the fixed BOTTOM exactly which parameters it writes ("What this
// writes", with any that this vehicle does not have) and the two buttons. The write is the staged changes' own: one question
// that names every parameter, each read back.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Pane from '@/components/ui/Pane.vue'
import type { ParamPanel } from '@/composables/useParamPanel'
import { usePanelWrite } from '@/composables/usePanelWrite'

const props = defineProps<{
  /** The page's parameters. */
  panel: ParamPanel
  /** A prefix for the ids of the parts, so that a page's own checks can find them. */
  idPrefix: string
  /** The page has a reason of its own not to write (a pair of values out of order). */
  hold?: boolean
  /** List only the parameters this vehicle has (a page for a board with a variable number of ports). */
  onlyPresent?: boolean
  /** List only the parameters that have a change to write (a page with many parameters, most of them left as they are). */
  onlyChanged?: boolean
}>()

/**
 * Whether the vehicle has a parameter of the page.
 *
 * @param id the parameter
 * @returns true if it does
 */
function present(id: string): boolean {
  return !props.panel.missing.value.includes(id)
}

const { t } = useI18n()
const { reason, writable, label, status, outcome } = usePanelWrite(() => props.panel, () => props.hold)
const shown = computed(() => {
  if (props.onlyChanged) {
    return props.panel.dirty.value
  }

  return props.onlyPresent ? props.panel.ids.filter(present) : props.panel.ids
})
</script>
