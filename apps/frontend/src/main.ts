import './style.css'
import { type NativeBridge, bridgeTransport } from '@pico-desktop/communicator'
import { createApp } from 'vue'
import type { State } from './configurator'
import { importView, listStatus, paramRows } from './render'
import { mockBackend } from './mock-backend'
import { createConfigurator } from './useConfigurator'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectionBar from './ConnectionBar.vue'
import MetadataStatus from './MetadataStatus.vue'
import ParamEditor from './ParamEditor.vue'
import TelemetryCards from './TelemetryCards.vue'

declare global {
  interface Window {
    picoDesktop?: NativeBridge
  }
}

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/** Last markup written per element: a region is rebuilt only when its markup changed (telemetry
 * ticks every second; a 1200-row parameter table shouldn't be rebuilt with it). */
const written = new Map<string, string>()
function setHtml(id: string, html: string) {
  if (written.get(id) !== html) {
    written.set(id, html)
    byId(id).innerHTML = html
  }
}

function render(state: State) {
  const visible = app.visible()
  byId('list-status').textContent = listStatus(state, visible.length)
  setHtml('rows', paramRows(visible, state.selected))
  byId<HTMLButtonElement>('refresh').disabled = state.connection.state !== 'connected' || state.list === 'loading'
  const loaded = state.importReview !== null || state.importError !== null
  byId('import-panel').hidden = !loaded
  setHtml('import', importView(state))
  byId<HTMLButtonElement>('apply').disabled = state.picked.length === 0 || state.applying || state.connection.state !== 'connected'
  byId<HTMLButtonElement>('backup').hidden = state.backup === null
  byId<HTMLButtonElement>('save').disabled = state.params.length === 0
}

// In Pico Desktop the native bridge; in a plain browser (`pnpm ui`) the mock backend.
const bridge = window.picoDesktop
const { app } = createConfigurator(bridge ? bridgeTransport(bridge) : mockBackend(), render)

// Regions already ported to components; the rest of the page is still written by render().
createApp(ConnectionBar).mount('#connection-bar')
createApp(ParamEditor).mount('#param-editor')
createApp(MetadataStatus).mount('#metadata-status-root')
createApp(TelemetryCards).mount('#telemetry')
createApp(ConfirmDialog).mount('#confirm-root')

byId('refresh').addEventListener('click', () => void app.refresh())
byId('filter').addEventListener('input', event => app.setFilter((event.target as HTMLInputElement).value))
byId('rows').addEventListener('click', event => {
  const row = (event.target as HTMLElement).closest('tr')
  if (row?.dataset.id) {
    app.select(row.dataset.id)
  }
})
/** Offers `text` as a file download (the browser's, or the host's save handling). */
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileName = (what: string) => {
  const v = app.state.connection.vehicle

  return `${what}-${v ? `${v.type.toLowerCase()}-${v.sysid}` : 'vehicle'}-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.json`
}

// In Pico Desktop files go through the backend's native dialogs; in a browser, downloads and uploads.
const save = (text: string, name: string) => bridge ? void app.saveFile(name, text) : download(text, name)
byId('save').addEventListener('click', () => save(app.snapshot(), fileName('params')))
byId('backup').addEventListener('click', () => save(app.state.backup ?? '', fileName('backup')))
byId('load-button').addEventListener('click', event => {
  if (bridge) {
    event.preventDefault()
    void app.openSnapshotFile()
  }
})
byId('load').addEventListener('change', event => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    void file.text().then(text => app.loadSnapshot(text))
  }
  input.value = ''
})
byId('metadata-button').addEventListener('click', event => {
  if (bridge) {
    event.preventDefault()
    void app.openMetadataFile()
  }
})
byId('metadata').addEventListener('change', event => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    void file.text().then(text => app.loadMetadata(text))
  }
  input.value = ''
})
byId('import').addEventListener('change', event => {
  const id = (event.target as HTMLElement).dataset.pick
  if (id) {
    app.togglePick(id)
  }
})
byId('apply').addEventListener('click', () => void app.applyImport())
byId('close-import').addEventListener('click', () => app.closeImport())
render(app.state)
