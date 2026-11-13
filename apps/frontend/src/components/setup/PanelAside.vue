<template>
  <aside class="setup-aside" :aria-label="t('setup.aside')">
    <slot />
    <div>
      <h2 class="setup-label">{{ t('setup.writes') }}</h2>
      <ul class="setup-writes">
        <li v-for="id in shown" :key="id" :class="{ missing: panel.missing.value.includes(id) }">
          {{ id }}<span v-if="panel.missing.value.includes(id)"> · {{ t('setup.notOnVehicle') }}</span>
        </li>
      </ul>
    </div>
    <Banner v-if="reason" :id="`${idPrefix}-blocked`" tone="warn">{{ reason }}</Banner>
    <p :id="`${idPrefix}-status`" class="setup-status" role="status">{{ status }}</p>
    <Button :id="`${idPrefix}-revert`" :disabled="panel.dirty.value.length === 0 || panel.writing.value" @click="panel.revert()">
      {{ t('setup.revert') }}
    </Button>
    <Button :id="`${idPrefix}-write`" :disabled="!writable" @click="panel.write()">{{ label }}</Button>
  </aside>
</template>

<script setup lang="ts">
// The side of a Setup page that writes parameters: exactly which ones ("What this writes", with any that this vehicle does not
// have), why nothing can be written now (offline, still loading, armed or not known to be disarmed), how the last write went in
// words ("Written and read back", or what the vehicle said), and the two buttons. The write is the staged changes' own: one
// question that names every parameter, each read back.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import type { ParamPanel } from '@/composables/useParamPanel'

const props = defineProps<{
  /** The page's parameters. */
  panel: ParamPanel
  /** A prefix for the ids of the parts, so that a page's own checks can find them. */
  idPrefix: string
  /** The page has a reason of its own not to write (a pair of values out of order). */
  hold?: boolean
  /** List only the parameters this vehicle has (a page for a board with a variable number of ports). */
  onlyPresent?: boolean
}>()

const { t } = useI18n()
const reason = computed(() => {
  const { blocked } = props.panel

  return blocked.value === null ? '' : t(`setup.blocked.${blocked.value}`)
})
const shown = computed(() => props.onlyPresent ? props.panel.ids.filter(present) : props.panel.ids)

/**
 * Whether the vehicle has a parameter of the page.
 *
 * @param id the parameter
 * @returns true if it does
 */
function present(id: string): boolean {
  return !props.panel.missing.value.includes(id)
}

const changed = computed(() => props.panel.dirty.value.length > 0)
const writable = computed(() => props.panel.blocked.value === null && changed.value && !props.panel.writing.value && !props.hold)
const label = computed(() => t(changed.value ? 'setup.write' : 'setup.noChanges'))
const status = computed(() => {
  const { state, detail } = props.panel

  if (state.value === 'written') {
    return t('setup.written')
  }

  return state.value === 'failed' ? t('setup.failed', { why: detail.value }) : ''
})
</script>
