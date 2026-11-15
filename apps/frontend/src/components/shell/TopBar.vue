<template>
  <header id="top-bar" class="top-bar" data-l="topbar">
    <h1 class="visually-hidden">{{ t('app.title') }}</h1>
    <ConnectionAnnouncement />
    <RouterLink :to="HOME" class="logo" :aria-label="t('topBar.home')">
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="5.5" cy="5.5" r="3" />
        <circle cx="18.5" cy="5.5" r="3" />
        <circle cx="5.5" cy="18.5" r="3" />
        <circle cx="18.5" cy="18.5" r="3" />
        <path d="m8 8 8 8M16 8l-8 8" />
      </svg>
    </RouterLink>
    <button
      id="open-connect"
      type="button"
      aria-haspopup="dialog"
      class="vehicle"
      :class="vehicle.tone"
      :title="t('connect.open')"
      @click="run('connect.open')"
    >
      <span class="dot" aria-hidden="true" />
      <span class="lines">
        <span class="title">{{ vehicle.title }}</span>
        <span class="sub">{{ vehicle.sub }}</span>
      </span>
      <Icon name="chevron-down" />
    </button>
    <dl class="cells">
      <div v-for="cell in cells" :key="cell.id" class="cell" :class="[cell.id, { armed: cell.armed }]">
        <dt>{{ cell.label }}</dt>
        <dd>
          <!-- STATE is the arm control of a disarmed vehicle: the review if there is something to review, else the hold. -->
          <button
            v-if="cell.id === 'state' && canArm"
            id="state-arm"
            type="button"
            class="cell-action"
            :title="t('topBar.armTip')"
            @click="beginArm"
          >
            {{ cell.value }}
          </button>
          <!-- MODE is the list of modes: a menu that is opened (never a field that changes as keys move over it). -->
          <Menu
            v-else-if="cell.id === 'mode' && !cell.missing && modes.items.value.length > 0"
            id="mode-menu"
            :label="cell.value"
            :trigger-label="t('strip.mode', { mode: cell.value })"
            :items="modes.items.value"
            @select="modes.pick"
          />
          <template v-else-if="cell.missing">
            <span aria-hidden="true">{{ cell.value }}</span>
            <span class="visually-hidden">{{ t('truth.notReported') }}</span>
          </template>
          <template v-else>{{ cell.value }}</template>
        </dd>
      </div>
    </dl>
    <div class="actions">
      <!-- The command palette has no button here: it is the command "Show command palette", reached by its key. -->
      <CommandButton id="disconnect-button" command="vehicle.disconnect" icon-position="none" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConnectionAnnouncement from './ConnectionAnnouncement.vue'
import CommandButton from '@/components/ui/CommandButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Menu from '@/components/ui/Menu.vue'
import { useArmGrace } from '@/composables/useArmGrace'
import { useModeMenu } from '@/composables/useModeMenu'
import { checksOf, needsReview } from '@/lib/fly/prearm'
import { HOME } from '@/screens/registry'
import { cellsFor, vehicleCellFor } from '@/lib/fly/topBar'
import { useConfigurator } from '@/composables/useConfigurator'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useFormat } from '@/i18n/useFormat'
import { useTelemetry } from '@/composables/useTelemetry'

// The top bar: the logo (home), the vehicle and the link, the five live cells MODE / STATE / BATTERY / GPS / LINK, and
// Disconnect. The cells show a vehicle only while the link is up (the last telemetry of a link that is gone is not what the
// vehicle is doing), and an armed vehicle fills its STATE cell amber, with the word ARMED too. Two cells are controls: MODE opens
// the list of modes (a scrolling menu), and STATE of a disarmed vehicle starts arming.
const { t } = useI18n()
const configurator = useConfigurator()
// The vehicle chip opens the connect dialog by running the `connect.open` command, as the buttons next to it run theirs.
const run = useCommandRunner()
const format = useFormat()
const telemetry = useTelemetry()
const state = computed(() => configurator.fields.connection.value.state)
const vehicle = computed(() => vehicleCellFor(configurator.fields.connection.value, t))
const cells = computed(() => cellsFor(state.value === 'connected' ? telemetry.value : null, t, format))
const modes = useModeMenu()
const { armed } = useArmGrace()
/** Whether STATE is the arm control: connected, and the heartbeat says disarmed (not armed, not just asked to arm). */
const canArm = computed(() => state.value === 'connected' && armed.value === false)

/** STATE was pressed: the review when there is something to review, else straight to the hold. The command asks the rest. */
function beginArm(): void {
  void run(needsReview(checksOf(configurator.fields.telemetry.value)) ? 'vehicle.review' : 'vehicle.arm')
}
</script>
