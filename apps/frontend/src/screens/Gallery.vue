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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import '../kit/gallery.css'
import Badge from '../kit/Badge.vue'
import Button from '../kit/Button.vue'
import Checkbox from '../kit/Checkbox.vue'
import Icon from '../kit/Icon.vue'
import { ICONS, type IconName } from '../kit/icons'
import SegmentedControl from '../kit/SegmentedControl.vue'
import Select from '../kit/Select.vue'
import SplitPane from '../kit/SplitPane.vue'
import Tabs from '../kit/Tabs.vue'
import TextInput from '../kit/TextInput.vue'
import Toggle from '../kit/Toggle.vue'

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
const option = ref('one')
const segment = ref('one')
const check = ref(true)
const toggle = ref(true)
const tab = ref('one')
const size = ref(50)
</script>
