<template>
  <Button id="save" :disabled="fields.params.value.length === 0" @click="saveSnapshot">{{ t('snapshot.save') }}</Button>
  <!-- Real buttons (a label over a hidden input cannot be reached by keyboard); in a browser they press the hidden input. -->
  <Button id="load-button" @click="openSnapshot">{{ t('snapshot.load') }}</Button>
  <input id="load" ref="snapshotInput" type="file" accept=".json,application/json" hidden @change="loadSnapshot">
  <Button id="metadata-button" @click="openMetadata">{{ t('snapshot.loadMetadata') }}</Button>
  <input id="metadata" ref="metadataInput" type="file" accept=".json,application/json" hidden @change="loadMetadata">
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { chosenText, hasHost, saveText, snapshotFileName } from './files'
import Button from './kit/Button.vue'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { snapshots, metadata, fields } = useConfigurator()

/** Saves the parameters as a snapshot file. */
function saveSnapshot() {
  saveText(snapshots, snapshots.snapshot(), snapshotFileName('params', fields.connection.value.vehicle))
}

const snapshotInput = ref<HTMLInputElement | null>(null)
const metadataInput = ref<HTMLInputElement | null>(null)

/**
 * In Pico Desktop the host's dialog opens the file; in a browser the button presses the file input.
 *
 * @param open asks the backend to open a file with the host's dialog
 * @param input the browser's file input
 */
function openWith(open: () => Promise<void>, input: HTMLInputElement | null) {
  if (hasHost()) {
    void open()
  } else {
    input?.click()
  }
}

/** Opens a snapshot file: with the host's dialog in Pico Desktop, with the file input in a browser. */
function openSnapshot() {
  openWith(() => snapshots.openFile(), snapshotInput.value)
}

/** Opens a parameter metadata file: with the host's dialog in Pico Desktop, with the file input in a browser. */
function openMetadata() {
  openWith(() => metadata.openFile(), metadataInput.value)
}

/**
 * Loads the snapshot file chosen in the browser's file input.
 *
 * @param event the input's change
 */
async function loadSnapshot(event: Event) {
  const text = await chosenText(event.target as HTMLInputElement)
  if (text !== null) {
    snapshots.load(text)
  }
}

/**
 * Loads the metadata file chosen in the browser's file input.
 *
 * @param event the input's change
 */
async function loadMetadata(event: Event) {
  const text = await chosenText(event.target as HTMLInputElement)
  if (text !== null) {
    metadata.load(text)
  }
}
</script>
