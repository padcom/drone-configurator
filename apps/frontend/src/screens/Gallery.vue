<template>
  <section class="gallery" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="visually-hidden">{{ t('gallery.title') }}</h2>
    <p class="muted">{{ t('gallery.intro') }}</p>

    <section>
      <h3>{{ t('gallery.section.colours') }}</h3>
      <ul class="swatches">
        <li v-for="token in COLOUR_TOKENS" :key="token" class="swatch" :data-token="token">
          <span class="chip" aria-hidden="true" />
          <code>{{ token }}</code>
        </li>
      </ul>
    </section>

    <section>
      <h3>{{ t('gallery.section.type') }}</h3>
      <ul class="specimens">
        <li v-for="size in TYPE_SIZES" :key="size.token" class="specimen" :data-size="size.token">
          <code>{{ size.token }}</code>
          <span class="sample" :class="{ mono: size.mono, label: size.token === '--font-size-label' }">
            {{ size.token === '--font-size-label' ? t('gallery.sample.labelText') : t('gallery.sample.specimen') }}
          </span>
        </li>
      </ul>
      <p class="hatch-sample">{{ t('gallery.sample.hatch') }}</p>
    </section>

    <section>
      <h3>{{ t('gallery.section.forms') }}</h3>
      <div class="form-demo">
        <PanelForm :rows="formRows" @change="changed" />
        <EnumField v-model="orphan" :options="actions" :label="t('gallery.form.unnamed')" />
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.paramFields') }}</h3>
      <div class="field-demo">
        <!-- A field bound to a parameter (a number in centimetres shown as metres): the buttons play what the vehicle does. -->
        <ParamField
          name="RTL_ALT"
          kind="number"
          unit="cm"
          :min="200"
          :max="3000"
          :step="50"
          integer
          :facts="demoFacts"
          :rejection="t('gallery.fields.reason')"
          @draft="demoDraft"
          @keep="demoKeep"
          @take="demoTake"
        />
        <div class="simulate" role="group" :aria-label="t('gallery.fields.simulate')">
          <Button @click="demoChanges">{{ t('gallery.fields.changes') }}</Button>
          <Button @click="demoWrite('writing')">{{ t('gallery.fields.writing') }}</Button>
          <Button @click="demoWrite('verified')">{{ t('gallery.fields.verified') }}</Button>
          <Button @click="demoWrite('rejected')">{{ t('gallery.fields.rejected') }}</Button>
          <Button @click="demoReset">{{ t('gallery.fields.reset') }}</Button>
        </div>
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.confirm') }}</h3>
      <div class="stack confirm-demo">
        <HoldButton :hold-ms="HOLD_MS">{{ t('gallery.confirm.holdWarn') }}</HoldButton>
        <HoldButton tone="error" :hold-ms="HOLD_MS">{{ t('gallery.confirm.holdError') }}</HoldButton>
        <SecondPress :label="t('gallery.confirm.erase')" :confirm-label="t('gallery.confirm.eraseSure')" />
        <TickUnlock v-model="ticked">{{ t('gallery.confirm.tick') }}</TickUnlock>
        <Button :disabled="!ticked">{{ t('gallery.confirm.spin') }}</Button>
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.feedback') }}</h3>
      <div class="row feedback-demo">
        <Menu :label="t('gallery.feedback.menu')" :items="menuItems" />
        <Tooltip :text="t('gallery.feedback.tip')" v-slot="{ describedby }">
          <Button :aria-describedby="describedby">{{ t('gallery.feedback.tipButton') }}</Button>
        </Tooltip>
        <Button @click="pushToast">{{ t('gallery.feedback.push') }}</Button>
      </div>
      <ToastHost :queue="toasts" />
    </section>

    <section>
      <h3>{{ t('gallery.section.truth') }}</h3>
      <div class="truths">
        <TruthValue
          v-for="item in TRUTH"
          :key="item.state"
          :label="t(`gallery.truth.${item.key}`)"
          :state="item.state"
          :value="item.value"
          :age-ms="6200"
          :help="t(`gallery.truth.${item.key}Rule`)"
        />
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.surfaces') }}</h3>
      <div class="row">
        <Panel compact aria-labelledby="gallery-panel">
          <SectionLabel id="gallery-panel" :level="4">{{ t('gallery.surface.label') }}</SectionLabel>
          <StatCell :label="t('gallery.surface.stat')">{{ t('gallery.surface.volts') }}</StatCell>
        </Panel>
        <Panel tag="div"><StatCell :label="t('gallery.surface.state')" tone="warn">{{ t('telemetry.armed') }}</StatCell></Panel>
      </div>
      <div class="stack">
        <Banner tone="info">{{ t('gallery.surface.info') }}</Banner>
        <Banner tone="warn">{{ t('gallery.surface.warn') }}</Banner>
        <Banner tone="error" urgent>{{ t('gallery.surface.alert') }}</Banner>
        <ProgressBar :value="0.6" :label="t('gallery.surface.progress')" />
        <EmptyState :title="t('gallery.surface.emptyTitle')" :help="t('gallery.surface.emptyHelp')">
          <Button variant="primary">{{ t('gallery.sample.primary') }}</Button>
        </EmptyState>
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.buttons') }}</h3>
      <div class="row">
        <Button>{{ t('gallery.sample.action') }}</Button>
        <Button variant="primary">{{ t('gallery.sample.primary') }}</Button>
        <Button variant="flight">{{ t('gallery.sample.flight') }}</Button>
        <Button disabled>{{ t('gallery.sample.disabled') }}</Button>
        <Button variant="flight" disabled>{{ t('gallery.sample.disabled') }}</Button>
        <Button variant="primary" disabled>{{ t('gallery.sample.disabled') }}</Button>
        <Button><Icon name="download" /> {{ t('gallery.sample.action') }}</Button>
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.commandButtons') }}</h3>
      <!-- Each look with the icon in each place, icon only, and a command that may not run (no vehicle is connected here). -->
      <div v-for="look in COMMAND_LOOKS" :key="look" class="row" :data-look="look">
        <CommandButton
          v-for="position in COMMAND_POSITIONS"
          :key="position"
          command="go.logs"
          :look="look"
          :icon-position="position"
        />
        <CommandButton command="go.logs" :look="look" icon-only />
        <CommandButton command="vehicle.reboot" :look="look" icon-position="left" />
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.fields') }}</h3>
      <div class="row">
        <TextInput v-model="text" :aria-label="t('gallery.sample.text')" :placeholder="t('gallery.sample.text')" />
        <TextInput v-model="value" mono large :aria-label="t('gallery.sample.value')" />
        <TextInput
          v-model="wrong"
          invalid
          :aria-label="t('gallery.sample.invalid')"
          aria-describedby="gallery-why"
        />
        <TextInput :model-value="text" disabled :aria-label="t('gallery.sample.disabled')" />
        <Select v-model="option" :aria-label="t('gallery.sample.select')" :options="options" />
        <Select v-model="option" disabled :aria-label="t('gallery.sample.disabled')" :options="options" />
      </div>
      <p id="gallery-why" class="error"><Icon name="warning" /> {{ t('gallery.sample.invalidWhy') }}</p>
    </section>

    <section>
      <h3>{{ t('gallery.section.choices') }}</h3>
      <div class="row">
        <Checkbox v-model="check">{{ t('gallery.sample.check') }}</Checkbox>
        <Checkbox v-model="check" disabled>{{ t('gallery.sample.disabled') }}</Checkbox>
        <Toggle v-model="toggle">{{ t('gallery.sample.toggle') }}</Toggle>
        <Toggle v-model="toggle" disabled>{{ t('gallery.sample.disabled') }}</Toggle>
      </div>
      <div class="row narrow">
        <Toggle id="gallery-toggle-long" v-model="toggle">{{ t('gallery.sample.toggleLong') }}</Toggle>
        <Toggle v-model="toggle" disabled>{{ t('gallery.sample.toggleLong') }}</Toggle>
      </div>
      <div class="row">
        <SegmentedControl v-model="segment" :label="t('gallery.sample.segments')" :options="options" />
        <SegmentedControl v-model="segment" :label="t('gallery.sample.segments')" :options="options" disabled />
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.badges') }}</h3>
      <div class="row">
        <Badge>{{ t('gallery.sample.neutral') }}</Badge>
        <Badge tone="info">{{ t('gallery.sample.info') }}</Badge>
        <Badge tone="ok">{{ t('gallery.sample.ok') }}</Badge>
        <Badge tone="warn">{{ t('gallery.sample.warn') }}</Badge>
        <Badge tone="error">{{ t('gallery.sample.error') }}</Badge>
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.panels') }}</h3>
      <Tabs v-model="tab" :label="t('gallery.sample.tabs')" :tabs="tabs">
        <template #one>{{ t('gallery.sample.panelOne') }}</template>
        <template #two>{{ t('gallery.sample.panelTwo') }}</template>
      </Tabs>
      <div class="split-demo">
        <SplitPane v-model="size" :label="t('gallery.sample.split')">
          <template #first><p>{{ t('gallery.sample.paneOne') }}</p></template>
          <template #second><p>{{ t('gallery.sample.paneTwo') }}</p></template>
        </SplitPane>
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.table') }}</h3>
      <div class="table-demo">
        <!-- 2000 rows of which only those in view are in the page; the name and the value are edited, a click sorts. -->
        <DataTable
          v-model:sort="tableSort"
          :rows="tableRows"
          :columns="tableColumns"
          :row-key="tableRowKey"
          :label="t('gallery.table.label')"
          @edit="tableEdited"
        />
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.charts') }}</h3>
      <div class="charts-demo">
        <!-- A long series thinned: the one-sample spike is in the envelope. The two charts share the cursor. -->
        <LineChart
          v-model:cursor="chartCursor"
          :title="t('gallery.chart.altitude')"
          :series="[{ id: 'a', label: 'm', points: WAVE }]"
        />
        <LineChart
          v-model:cursor="chartCursor"
          :title="t('gallery.chart.battery')"
          :series="[{ id: 'b', label: 'V', points: GAPPED, tone: 'ok' }]"
        />
        <LineChart :title="t('gallery.chart.old')" :series="[{ id: 'c', label: 'm', points: WAVE }]" stale />
        <LineChart :title="t('gallery.chart.none')" :series="[{ id: 'd', label: 'm', points: [] }]" />
      </div>
    </section>

    <section>
      <h3>{{ t('gallery.section.icons') }}</h3>
      <ul class="icons">
        <li v-for="name in ICON_NAMES" :key="name"><Icon :name="name" /> <code>{{ name }}</code></li>
      </ul>
    </section>

    <section>
      <h3>{{ t('gallery.section.contextMenu') }}</h3>
      <ContextMenu :label="t('gallery.context.label')" :items="contextItems" @select="contextChosen = $event">
        <div class="context-area" tabindex="0">{{ t('gallery.context.area') }}</div>
      </ContextMenu>
      <p class="muted" aria-live="polite">
        {{ contextChosen === null ? t('gallery.context.none') : t('gallery.context.chosen', { item: contextLabel }) }}
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import '@/assets/styles/gallery.css'
import LineChart from '@/components/charts/LineChart.vue'
import { decimate } from '@/lib/charts/chart'
import Badge from '@/components/ui/Badge.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import ContextMenu from '@/components/ui/ContextMenu.vue'
import CommandButton from '@/components/ui/CommandButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import type { Column, Sort } from '@/lib/ui/dataTable'
import EmptyState from '@/components/ui/EmptyState.vue'
import HoldButton from '@/components/ui/HoldButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Menu from '@/components/ui/Menu.vue'
import { ICONS, type IconName } from '@/lib/ui/icons'
import Panel from '@/components/ui/Panel.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import SecondPress from '@/components/ui/SecondPress.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import SplitPane from '@/components/ui/SplitPane.vue'
import StatCell from '@/components/ui/StatCell.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TickUnlock from '@/components/ui/TickUnlock.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import EnumField from '@/components/fields/EnumField.vue'
import PanelForm from '@/components/fields/PanelForm.vue'
import ParamField from '@/components/fields/ParamField.vue'
import { type FieldFacts, type WriteState, settled } from '@/lib/params/fieldState'
import type { FormRow, FormValue } from '@/lib/params/panelForm'
import ToastHost from '@/components/shell/ToastHost.vue'
import { HOLD_MS } from '@/lib/app/safety'
import { createToasts } from '@/composables/toasts'
import TruthValue from '@/components/fields/TruthValue.vue'

// Every control of the kit in its states: what a developer looks at to see that a change to a token or a control holds.
// It is only in the development build (screens.ts).
const { t } = useI18n()
const uid = useId()

/** The looks of a command button, and the places its icon can be, for the section that shows them all. */
const COMMAND_LOOKS = ['rail', 'default', 'primary', 'flight'] as const
const COMMAND_POSITIONS = ['top', 'left', 'right', 'bottom', 'none'] as const

const COLOUR_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-text',
  '--color-text-muted',
  '--color-border',
  '--color-border-strong',
  '--color-accent',
  '--color-accent-soft',
  '--color-on-accent',
  '--color-ok',
  '--color-ok-soft',
  '--color-warn',
  '--color-warn-soft',
  '--color-error',
  '--color-error-soft',
  '--color-route',
  '--color-text-dim',
  '--color-on-warn',
  '--color-on-error',
  '--color-warn-progress',
  '--color-error-progress',
  '--color-accent-hover',
  '--color-map',
]

/** The type scale, from the smallest: a token each, and whether the size is for a value (in the mono face). */
const TYPE_SIZES = [
  { token: '--font-size-label', mono: false },
  { token: '--font-size-sm', mono: false },
  { token: '--font-size-md', mono: false },
  { token: '--font-size-value-sm', mono: true },
  { token: '--font-size-value', mono: true },
  { token: '--font-size-lg', mono: false },
  { token: '--font-size-card', mono: true },
  { token: '--font-size-title', mono: false },
  { token: '--font-size-xl', mono: false },
  { token: '--font-size-2xl', mono: false },
  { token: '--font-size-hero', mono: true },
]

/** The five states of a value from the vehicle, with the value each shows. */
const TRUTH = [
  { key: 'live', state: 'live', value: '12.54 V' },
  { key: 'stale', state: 'stale', value: '12.54 V' },
  { key: 'lastHeard', state: 'last-heard', value: '12.54 V' },
  { key: 'never', state: 'never', value: undefined },
  { key: 'verified', state: 'verified', value: '✓ 300' },
] as const
const ICON_NAMES = Object.keys(ICONS) as IconName[]

/** Sample data for the charts: a wave of 5000 samples with one spike, thinned; and the same with a stretch absent. */
const SAMPLES = Array.from({ length: 5000 }, (_unused, n) => ({
  x: n / 10,
  y: 20 + 10 * Math.sin(n / 400) + (n === 3333 ? 40 : 0),
}))
const WAVE = decimate(SAMPLES, 240)
const GAPPED = decimate(SAMPLES.map(s => ({ x: s.x, y: s.x > 200 && s.x < 260 ? null : s.y / 2 })), 240)
const chartCursor = ref<number | null>(null)

/** The sample rows of the table: 2000 of them, of which the table draws the few in view. */
interface SampleRow {
  id: number
  name: string
  value: number
}
const tableRows = ref<SampleRow[]>(Array.from({ length: 2000 }, (_unused, n) => ({
  id: n + 1,
  name: `PARAM_${String(n + 1).padStart(4, '0')}`,
  value: (n * 37) % 1000,
})))
const tableSort = ref<Sort | null>(null)
const tableColumns = computed<Column<SampleRow>[]>(() => [
  { id: 'id', header: t('gallery.table.col.number'), value: row => row.id, sortable: true, align: 'end', width: 100 },
  { id: 'name', header: t('gallery.table.col.name'), value: row => row.name, sortable: true, editable: true, width: 220 },
  { id: 'value', header: t('gallery.table.col.value'), value: row => row.value, sortable: true, editable: true, align: 'end' },
])
const tableRowKey = (row: SampleRow): number => row.id

/**
 * A cell of the sample table was edited: the row is replaced by a changed copy, as a store would.
 *
 * @param row the row
 * @param column the column
 * @param text what was typed
 */
function tableEdited(row: SampleRow, column: Column<SampleRow>, text: string): void {
  const edited = column.id === 'value' ? { ...row, value: Number(text) || 0 } : { ...row, name: text }

  tableRows.value = tableRows.value.map(candidate => (candidate.id === row.id ? edited : candidate))
}

const options = computed(() => [
  { value: 'one', label: t('gallery.sample.optionOne') },
  { value: 'two', label: t('gallery.sample.optionTwo') },
])
const tabs = computed(() => [
  { id: 'one', label: t('gallery.sample.tabOne') },
  { id: 'two', label: t('gallery.sample.tabTwo') },
])

const text = ref('')
const wrong = ref('abc')
const value = ref('1500')
/** The gallery's own toast queue, with the three severities already in it (they stay: sticky). */
const toasts = createToasts()
for (const [severity, key] of [['success', 'ok'], ['warning', 'warn'], ['error', 'bad']] as const) {
  toasts.push({ severity, text: t(`gallery.feedback.toast.${key}`), sticky: true })
}
const menuItems = computed(() => [
  { id: 'fly', label: t('gallery.feedback.item.fly') },
  { id: 'home', label: t('gallery.feedback.item.home'), disabled: true },
  { id: 'look', label: t('gallery.feedback.item.look') },
  { id: 'copy', label: t('gallery.feedback.item.copy'), hint: 'Ctrl C' },
])

/** Pushes one more toast, so that the queue can be seen to fill and to wait. */
function pushToast(): void {
  toasts.push({ severity: 'success', text: t('gallery.feedback.toast.more', { n: Date.now() % 1000 }) })
}

const ticked = ref(false)
const form = reactive({ action: 1, altitude: 20, battery: true, name: 'Quad 1' })
/** A number the vehicle holds that has no name in the list (the field shows it as it is). */
const orphan = ref(7)
const actions = computed(() => [0, 1, 2].map(n => ({ value: n, label: t(`gallery.form.action${n}`) })))

/** The sample parameter field: what the vehicle holds, the draft over it, and where the write is. */
const demoFacts = reactive<FieldFacts>({ vehicle: 1500, draft: null, basis: undefined, write: 'idle' })

/**
 * The person made a draft: it begins over what the vehicle holds now.
 *
 * @param made the draft
 */
function demoDraft(made: number): void {
  demoFacts.basis = demoFacts.draft === null ? demoFacts.vehicle : demoFacts.basis
  demoFacts.draft = made
  demoFacts.write = 'idle'
}

/** The vehicle changes the parameter itself. */
function demoChanges(): void {
  demoFacts.vehicle = (demoFacts.vehicle ?? 0) + 100
}

/**
 * The write is under way, or the vehicle read it back, or it rejected it.
 *
 * @param state where the write is
 */
function demoWrite(state: WriteState): void {
  demoFacts.write = state
  demoFacts.vehicle = state === 'verified' ? demoFacts.draft ?? demoFacts.vehicle : demoFacts.vehicle
}

/** Starts again: the vehicle holds 15 m, there is no draft. */
function demoReset(): void {
  Object.assign(demoFacts, { vehicle: 1500, draft: null, basis: undefined, write: 'idle' })
}

/** The person keeps the draft over what the vehicle changed. */
function demoKeep(): void {
  Object.assign(demoFacts, settled('keep', demoFacts))
}

/** The person takes what the vehicle changed it to. */
function demoTake(): void {
  Object.assign(demoFacts, settled('take', demoFacts))
}
const formRows = computed<FormRow[]>(() => [
  { kind: 'head', id: 'h', text: t('gallery.form.head') },
  { kind: 'note', id: 'n', text: t('gallery.form.note') },
  { kind: 'warn', id: 'w', text: t('gallery.form.warn') },
  { kind: 'info', id: 'i', label: t('gallery.form.info'), value: '4.5.7' },
  {
    kind: 'slider',
    id: 'altitude',
    label: t('gallery.form.altitude'),
    value: form.altitude,
    min: 5,
    max: 100,
    step: 1,
    text: `${form.altitude} m`,
  },
  { kind: 'check', id: 'battery', label: t('gallery.form.battery'), value: form.battery },
  { kind: 'text', id: 'name', label: t('gallery.form.name'), value: form.name },
  { kind: 'enum', id: 'action', label: t('gallery.form.action'), value: form.action, options: actions.value },
  { kind: 'button', id: 'save', label: t('gallery.form.save'), tone: 'primary' },
])

/**
 * A row of the form was changed: the gallery keeps the value, as a screen would.
 *
 * @param id the row
 * @param to the new value
 */
function changed(id: string, to: FormValue): void {
  Object.assign(form, { [id]: to })
}
const option = ref('one')
const segment = ref('one')
const check = ref(true)
const toggle = ref(true)
const tab = ref('one')
const size = ref(50)

/** The sample context menu: its items, and which was chosen last (its id). */
const contextChosen = ref<string | null>(null)
const contextItems = computed(() => ['fly', 'copy', 'delete'].map(id => ({
  id,
  label: t(`gallery.context.item.${id}`),
  danger: id === 'delete',
})))
const contextLabel = computed(() => contextItems.value.find(item => item.id === contextChosen.value)?.label ?? '')
</script>
