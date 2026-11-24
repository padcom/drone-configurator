<template>
  <Popover
    v-if="stats"
    id="link-quality"
    class="link-quality"
    :class="level"
    :label="t('topBar.link.open', { value, level: levelText })"
    :title="t('topBar.link.title')"
  >
    <template #trigger>
      <Icon v-if="level !== 'ok'" name="warning" />
      <span class="link-value">{{ value }}</span>
      <span v-if="level !== 'ok'" class="link-level">{{ levelText }}</span>
    </template>
    <dl class="link-details">
      <div v-for="line in details" :key="line.id" class="link-detail" :class="line.id">
        <dt>{{ line.label }}</dt>
        <dd>{{ line.value }}</dd>
      </div>
    </dl>
    <p class="link-window">{{ t('topBar.link.window', { seconds: format.number(stats.windowMs / 1000, 1) }) }}</p>
  </Popover>
  <template v-else>
    <span aria-hidden="true">{{ t('telemetry.missing') }}</span>
    <span class="visually-hidden">{{ t('truth.notReported') }}</span>
  </template>
</template>

<script setup lang="ts">
// The LINK cell of the top bar (#29): how much of what the vehicle sent arrived, as a percentage, and a button that opens the
// details: the loss, the latency, the rates both ways, how long since the last packet. A weak or poor link says so in words and
// with an icon, not by colour alone. Without a connected vehicle it is a dash, like every cell.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import Popover from '@/components/ui/Popover.vue'
import { levelOf, linkDetails, linkValue } from '@/lib/fly/linkQuality'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'

const { t } = useI18n()
const format = useFormat()
const { link } = useConfigurator()
const stats = computed(() => link.stats.value)
const level = computed(() => (stats.value ? levelOf(stats.value) : 'ok'))
const levelText = computed(() => t(`topBar.link.level.${level.value}`))
const value = computed(() => (stats.value ? linkValue(stats.value, format) : ''))
const details = computed(() => (stats.value ? linkDetails(stats.value, t, format) : []))
</script>
