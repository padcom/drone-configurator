<template>
  <Hud :model="model" :reconnecting="reconnecting" />
  <div id="telemetry" class="fly-cards">
    <TruthValue
      v-for="card in cards"
      :key="card.id"
      :label="card.label"
      :state="card.state"
      :value="card.value"
      :age-ms="card.ageMs"
      :help="card.help"
    />
  </div>
  <MessagesList />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { flyCards } from './flyCards'
import Hud from './hud/Hud.vue'
import { hudModel } from './hud/model'
import MessagesList from './MessagesList.vue'
import TruthValue from './TruthValue.vue'
import { useConfigurator } from './useConfigurator'
import { useFormat } from './useFormat'
import { useTelemetry } from './useTelemetry'

// What the Fly aside shows of the vehicle: the heads-up display, the six cards (each with the truth about its value), and the
// messages. The display and the cards stay where they are; only the messages scroll (fly.css). All of it follows the
// telemetry once per frame.
const { t } = useI18n()
const f = useFormat()
const { fields } = useConfigurator()
const telemetry = useTelemetry()
const reconnecting = computed(() => fields.connection.value.state === 'reconnecting')
// The HUD and the cards show a vehicle only while there is telemetry: without a link, every value is a dash.
const model = computed(() => hudModel(telemetry.value ?? undefined, reconnecting.value))
const cards = computed(() => flyCards(telemetry.value, reconnecting.value, t, f))
</script>
