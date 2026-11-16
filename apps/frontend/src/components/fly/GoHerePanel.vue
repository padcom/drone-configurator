<template>
  <section v-if="target" id="go-here" class="go-here" :aria-label="t('guided.panel.title')">
    <p id="go-here-place" class="go-here-place">
      <span>{{ t('guided.panel.place', { lat: target.lat.toFixed(5), lon: target.lon.toFixed(5) }) }}</span>
      <span class="muted">{{ away }}</span>
    </p>
    <p v-if="why" id="go-here-why" class="go-here-why" role="status">{{ why }}</p>
    <div class="go-here-buttons">
      <CommandButton id="go-here-go" command="vehicle.goHere" icon-position="none" />
      <Button id="go-here-clear" @click="clear">{{ t('guided.panel.clear') }}</Button>
    </div>
  </section>
</template>

<script setup lang="ts">
// The place picked on the map, and what can be done with it: Go here (the command, with its own reason when it may not run),
// and Clear.
// How far the place is from the vehicle and from home is said in words, so that the confirmation that follows does not tell it
// first.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import CommandButton from '@/components/ui/CommandButton.vue'
import { useCommandContext, useCommands } from '@/composables/useCommands'
import { useConfigurator } from '@/composables/useConfigurator'
import { useGoHere } from '@/composables/useGoHere'
import { type Place, distanceM } from '@/lib/fly/guided'

const { t } = useI18n()
const { fields } = useConfigurator()
const { target, clear } = useGoHere()
const ctx = useCommandContext()
const registry = useCommands()

/**
 * How far a place is from a position, in whole metres, or a question mark when there is no position.
 *
 * @param from the position, if the vehicle reports one
 * @param place the picked place
 * @returns the text
 */
function metres(from: Place | undefined, place: Place): string {
  return from === undefined ? '?' : String(Math.round(distanceM(from, place)))
}

/** How far the place is from the vehicle and from home (whole metres). */
const away = computed(() => {
  const place = target.value
  const telemetry = fields.telemetry.value

  if (place === null) {
    return ''
  }

  return t('guided.panel.away', { distance: metres(telemetry?.position, place), fromHome: metres(telemetry?.home, place) })
})

/** Why Go here may not run now, in words (nothing when it may). */
const why = computed(() => {
  const availability = registry.get('vehicle.goHere')?.isEnabled(ctx)

  return availability?.enabled === false ? ctx.say(availability.reasonKey, availability.reasonParams) : ''
})
</script>
