<template>
  <div class="gallery">
    <h2>{{ t('gallery.title') }}</h2>
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
      <h3>{{ t('gallery.section.icons') }}</h3>
      <ul class="icons">
        <li v-for="name in ICON_NAMES" :key="name"><Icon :name="name" /> <code>{{ name }}</code></li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import '../kit/gallery.css'
import Badge from '../kit/Badge.vue'
import Banner from '../kit/Banner.vue'
import Button from '../kit/Button.vue'
import Checkbox from '../kit/Checkbox.vue'
import EmptyState from '../kit/EmptyState.vue'
import Icon from '../kit/Icon.vue'
import Menu from '../kit/Menu.vue'
import { ICONS, type IconName } from '../kit/icons'
import Panel from '../kit/Panel.vue'
import ProgressBar from '../kit/ProgressBar.vue'
import SectionLabel from '../kit/SectionLabel.vue'
import SegmentedControl from '../kit/SegmentedControl.vue'
import Select from '../kit/Select.vue'
import SplitPane from '../kit/SplitPane.vue'
import StatCell from '../kit/StatCell.vue'
import Tabs from '../kit/Tabs.vue'
import Tooltip from '../kit/Tooltip.vue'
import TextInput from '../kit/TextInput.vue'
import Toggle from '../kit/Toggle.vue'
import EnumField from '../EnumField.vue'
import PanelForm from '../PanelForm.vue'
import type { FormRow, FormValue } from '../panelForm'
import ToastHost from '../ToastHost.vue'
import { createToasts } from '../toasts'
import TruthValue from '../TruthValue.vue'

// Every control of the kit in its states: what a developer looks at to see that a change to a token or a control holds.
// It is only in the development build (screens.ts).
const { t } = useI18n()

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

const form = reactive({ action: 1, altitude: 20, battery: true, name: 'Quad 1' })
/** A number the vehicle holds that has no name in the list (the field shows it as it is). */
const orphan = ref(7)
const actions = computed(() => [0, 1, 2].map(n => ({ value: n, label: t(`gallery.form.action${n}`) })))
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
</script>
