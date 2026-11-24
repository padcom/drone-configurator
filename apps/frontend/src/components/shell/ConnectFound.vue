<template>
  <div class="connect-found">
    <div class="connect-found-head">
      <SectionLabel>{{ t('connect.found.label') }}</SectionLabel>
      <Button id="discover" :disabled="looking" @click="look">{{ t('connect.found.again') }}</Button>
    </div>
    <p id="found-status" class="connect-note" role="status">{{ status }}</p>
    <ul v-if="services.length > 0" id="found" class="connect-found-list">
      <li
        v-for="(service, index) in services"
        :key="`${service.transport} ${service.host}:${service.port}`"
        class="connect-found-item"
      >
        <span class="connect-found-text">
          <span class="connect-found-name">{{ service.name }}</span>
          <span class="connect-found-detail">{{ detail(service) }}</span>
        </span>
        <Button :id="`found-connect-${index}`" @click="emit('pick', service)">{{ t('connection.connect') }}</Button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DiscoveredService } from '@/generated/app'
import Button from '@/components/ui/Button.vue'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import { useConfigurator } from '@/composables/useConfigurator'

// The Connect dialog's Found tab (#197): the MAVLink services that answered on the local network (the backend asks over
// multicast DNS for `_mavlink._udp` and `_mavlink._tcp`), each with its own Connect. It looks when it is shown, and again on
// "Look again". A UDP service is reached by sending to it, a TCP one by connecting to it.
const emit = defineEmits<{
  /** Connect to this one. */
  pick: [service: DiscoveredService]
}>()

const { t } = useI18n()
const { vehicle } = useConfigurator()
const looking = ref(false)
const services = shallowRef<DiscoveredService[]>([])
const error = ref<string | undefined>(undefined)

/**
 * Where a service is, and how it is reached.
 *
 * @param service what was found
 * @returns the text under its name
 */
function detail(service: DiscoveredService): string {
  return t('connect.found.detail', { kind: t(`connect.found.kind.${service.transport}`), host: service.host, port: service.port })
}

// What the look found, in words: while it looks, why it could not, nothing, or how many.
const status = computed(() => {
  if (looking.value) {
    return t('connect.found.looking')
  }
  if (error.value) {
    return t('connect.found.failed', { error: error.value })
  }

  const count = services.value.length

  return count === 0 ? t('connect.found.none') : t('connect.found.count', { count }, count)
})

/** Looks on the network; what was found before stays listed until the answer comes. */
async function look(): Promise<void> {
  looking.value = true
  const found = await vehicle.discover()
  services.value = found.services
  error.value = found.error
  looking.value = false
}

onMounted(() => {
  void look()
})
</script>
