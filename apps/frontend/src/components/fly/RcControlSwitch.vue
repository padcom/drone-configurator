<template>
  <section v-if="rc.block.value !== 'off'" id="rc-control" class="fly-rc" :aria-label="t('rc.switch')">
    <Toggle
      id="rc-control-switch"
      :model-value="rc.active.value"
      :disabled="rc.block.value !== null && !rc.active.value"
      :aria-describedby="`${uid}-help`"
      @update:model-value="change"
    >
      {{ t('rc.switch') }}
    </Toggle>
    <p :id="`${uid}-help`" class="muted" role="status">{{ help }}</p>
  </section>
</template>

<script setup lang="ts">
// The switch of the RC control on the Fly screen (the same control the top-bar indicator and the palette command have). It is
// there only when the setting allows RC control (Settings), so that a screen of someone who does not use it has nothing about it.
// Turning it on asks the summary the first time in a session; turning it off is one click, and asks nothing. The line under it
// says where the control is: why it cannot be turned on, that the throttle must be lowered first, or that the pad is flying.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { namedVehicleOf, summaryOptions } from '@/lib/rc/summary'

const { t } = useI18n()
const uid = useId()
const { rcControl: rc, confirmWith, fields } = useConfigurator()

/** What the line says while the control is off: what stops it, else why it ended or was refused last, else that it is off. */
const offHelp = computed(() => {
  const { block, explanation } = rc

  return block.value === null ? (explanation.value ?? t('rc.help.off')) : t(`rc.reason.${block.value}`)
})
const help = computed(() => {
  if (!rc.active.value) {
    return offHelp.value
  }

  return rc.gateOpen.value ? t('rc.help.on') : t('rc.help.lower')
})

/**
 * The switch was pressed.
 *
 * @param on whether it is to be on
 */
function change(on: boolean): void {
  if (!on) {
    rc.disable()

    return
  }
  const vehicle = namedVehicleOf(fields.connection.value.vehicle, (key, named) => t(key, named ?? {}))

  void rc.turnOn(() => confirmWith(summaryOptions((key, named) => t(key, named ?? {}), vehicle)))
}
</script>
