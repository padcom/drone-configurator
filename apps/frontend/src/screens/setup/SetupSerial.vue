<template>
  <section class="setup-page-body" :aria-label="t('setup.section.serial')">
    <div class="setup-main">
      <p class="muted">{{ t('setup.serial.summary') }}</p>
      <p v-if="ports.length > 0" id="setup-serial-inuse" class="setup-progress">{{ t('setup.serial.inUse', { used }) }}</p>
      <RebootBanner :show="rebootNeeded" />
      <Banner v-if="cutAfter.length > 0" id="setup-serial-cut-after" tone="warn">
        {{ t('setup.serial.willCut', { ports: cutAfter.join(', ') }) }}
      </Banner>
      <Banner v-if="cutting.length > 0" id="setup-serial-cut" tone="warn">
        {{ t('setup.serial.mayCut', { ports: cutting.join(', ') }) }}
      </Banner>
      <ul class="setup-ports">
        <li v-for="port in ports" :key="port" class="setup-port" :data-port="port">
          <span class="setup-port-name">{{ t('setup.serial.port', { n: port }) }}</span>
          <EnumField
            :model-value="panel.value(portParams(port).protocol) ?? -1"
            :options="protocols"
            :label="t('setup.serial.protocol', { n: port })"
            :disabled="panel.blocked.value !== null"
            @update:model-value="panel.set(portParams(port).protocol, $event)"
          />
          <EnumField
            :model-value="panel.value(portParams(port).baud) ?? 0"
            :options="bauds"
            :label="t('setup.serial.baud', { n: port })"
            :disabled="panel.blocked.value !== null"
            @update:model-value="panel.set(portParams(port).baud, $event)"
          />
        </li>
      </ul>
      <p v-if="ports.length === 0" class="muted">{{ t('setup.serial.none') }}</p>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-serial" only-present />
  </section>
</template>

<script setup lang="ts">
// Serial ports: the protocol and the speed of each port the vehicle has, as named choices (ArduPilot's own lists: a value with no
// name is shown as its number). A change takes effect at the next boot: the page says "reboot needed" after the write and
// offers the reboot (held, refused while armed); it never reboots by itself. A change to a port that carries MAVLink, or to
// SERIAL0, may cut the connection this app talks over: the page says "may" (it does not know which port the link is on)
// before it is written.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelAside from '@/components/setup/PanelAside.vue'
import RebootBanner from '@/components/setup/RebootBanner.vue'
import Banner from '@/components/ui/Banner.vue'
import EnumField from '@/components/fields/EnumField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { optionsOf } from '@/lib/setup/frame'
import { BAUDS, MAX_PORTS, PROTOCOLS, cutByReboot, idsOf, inUse, mayCutLink, portParams, portsOn } from '@/lib/setup/serial'

const { t } = useI18n()
const handle = useConfigurator()
const panel = useParamPanel(idsOf(Array.from({ length: MAX_PORTS }, (_unused, port) => port)), handle)
const ports = computed(() => portsOn(id => panel.vehicleValue(id) !== null))
const used = computed(() => inUse(ports.value.map(port => panel.vehicleValue(portParams(port).protocol) ?? -1)))
const protocols = computed(() => optionsOf(PROTOCOLS, { value: -1, label: t('setup.serial.noProtocol') }))
const bauds = optionsOf(BAUDS)
const rebootNeeded = computed(() => panel.written.value.length > 0)
/** The ports written and not rebooted for yet whose change will probably cut the link at the reboot (MAVLink, or SERIAL0). */
const cutAfter = computed(() => cutByReboot(panel.written.value, panel.writtenWas.value, id => panel.vehicleValue(id)))
/**
 * Whether the user has changed a port.
 *
 * @param port the port
 * @returns true if its protocol or its speed differs from the vehicle's
 */
function changed(port: number): boolean {
  const { protocol, baud } = portParams(port)

  return panel.dirty.value.includes(protocol) || panel.dirty.value.includes(baud)
}

/**
 * Whether changing a port may cut the link.
 *
 * @param port the port
 * @returns true when the port is changed and carries MAVLink now, or is SERIAL0
 */
function cuts(port: number): boolean {
  return changed(port) && mayCutLink(port, panel.vehicleValue(portParams(port).protocol) ?? -1)
}

/** The ports whose change may cut the link. */
const cutting = computed(() => ports.value.filter(cuts))
</script>
