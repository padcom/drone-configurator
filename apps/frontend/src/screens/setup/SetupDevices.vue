<template>
  <section class="setup-page-body single" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="setup-heading">{{ t('setup.section.devices') }}</h3>
      <p class="muted">{{ t('setup.devices.summary') }}</p>
      <p v-if="rows.length === 0" id="setup-devices-none" class="muted">{{ t('setup.devices.none') }}</p>
      <table v-else class="setup-sensors">
        <thead>
          <tr>
            <th scope="col">{{ t('setup.devices.sensor') }}</th>
            <th scope="col">{{ t('setup.devices.bus') }}</th>
            <th scope="col">{{ t('setup.devices.address') }}</th>
            <th scope="col">{{ t('setup.devices.type') }}</th>
            <th scope="col">{{ t('setup.devices.id') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.param" :data-device="row.param">
            <th scope="row">{{ t(`setup.devices.kind.${row.kind}`) }} {{ row.index }}</th>
            <template v-if="row.decoded">
              <td>{{ t(`setup.devices.buses.${row.decoded.bus}`) }} {{ row.decoded.instance }}</td>
              <td>{{ hexOf(row.decoded.address) }}</td>
              <td>{{ row.decoded.type }}</td>
            </template>
            <td v-else colspan="3">{{ t('setup.devices.absent') }}</td>
            <td class="muted">{{ row.id }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">{{ t('setup.devices.typeHelp') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
// Devices: the sensors the vehicle has seen (compasses, accelerometers, gyros, barometers), each with the id it keeps for it
// decoded into the kind of bus, which bus, the address on it and the device type (lib/setup/deviceId.ts says how, and where
// in ArduPilot's source). The device type is a number that only means something for the kind of sensor, so it is shown as the
// number. A sensor whose id is 0 was never seen. Read-only: nothing is written from here.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'
import { deviceRows, hexOf } from '@/lib/setup/deviceId'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const byId = computed(() => new Map(handle.parameters.params.value.map(param => [param.id, param.value])))
const rows = computed(() => deviceRows(byId.value))
</script>
