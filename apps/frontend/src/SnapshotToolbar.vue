<template>
  <button id="save" type="button" :disabled="fields.params.value.length === 0" @click="saveSnapshot">
    {{ t('snapshot.save') }}
  </button>
  <label id="load-button" class="button" @click="openSnapshot">
    {{ t('snapshot.load') }}
    <input id="load" type="file" accept=".json,application/json" hidden @change="loadSnapshot">
  </label>
  <label id="metadata-button" class="button" @click="openMetadata">
    {{ t('snapshot.loadMetadata') }}
    <input id="metadata" type="file" accept=".json,application/json" hidden @change="loadMetadata">
  </label>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { chosenText, hasHost, saveText, snapshotFileName } from './files'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { app, fields } = useConfigurator()

/** Saves the parameters as a snapshot file. */
function saveSnapshot() {
  saveText(app, app.snapshot(), snapshotFileName('params', fields.connection.value.vehicle))
}

/**
 * In Pico Desktop the host's dialog opens the file; in a browser the label opens the file input.
 *
 * @param event the click on the label
 * @param open asks the backend to open a file with the host's dialog
 */
function openWith(event: Event, open: () => Promise<void>) {
  if (hasHost()) {
    event.preventDefault()
    void open()
  }
}

/**
 * Opens a snapshot file with the host's dialog, in Pico Desktop.
 *
 * @param event the click on the label
 */
function openSnapshot(event: Event) {
  openWith(event, () => app.openSnapshotFile())
}

/**
 * Opens a parameter metadata file with the host's dialog, in Pico Desktop.
 *
 * @param event the click on the label
 */
function openMetadata(event: Event) {
  openWith(event, () => app.openMetadataFile())
}

/**
 * Loads the snapshot file chosen in the browser's file input.
 *
 * @param event the input's change
 */
async function loadSnapshot(event: Event) {
  const text = await chosenText(event.target as HTMLInputElement)
  if (text !== null) {
    app.loadSnapshot(text)
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
    app.loadMetadata(text)
  }
}
</script>
