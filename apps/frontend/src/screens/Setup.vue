<template>
  <section class="setup" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="visually-hidden">{{ t('screen.setup') }}</h2>
    <EmptyState
      v-if="connection.state !== 'connected'"
      :title="t('setup.offline.title')"
      :help="t('setup.offline.help')"
      :level="3"
    />
    <EmptyState
      v-else-if="!multicopter"
      :title="t('setup.kind.title')"
      :help="t('setup.kind.help', { type: vehicleType })"
      :level="3"
    />
    <div v-else class="setup-body">
      <SetupNav :status="status" />
      <!-- The page shown stays alive when another is: what was chosen and not written is there when it is shown again. -->
      <div class="setup-page">
        <RouterView v-slot="{ Component, route }">
          <KeepAlive>
            <component :is="Component" :key="String(route.name)" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// The Setup screen: the list of its pages on the left (each page of the get-flying group marked by what the parameters say of
// it), and the page the address names. Setup is for a multicopter that is connected; another kind of vehicle, or none, is told
// so in words, with no page that could not work. Each page is a nested route of the registry, loaded when it is first shown.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useSetupStatus } from '@/composables/useSetupStatus'
import { isMulticopter } from '@/lib/setup/vehicleKind'
import SetupNav from './setup/SetupNav.vue'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const { connection } = handle.fields
const vehicleType = computed(() => connection.value.vehicle?.type ?? '')
const multicopter = computed(() => isMulticopter(connection.value.vehicle?.type))
const status = useSetupStatus(handle)
</script>
