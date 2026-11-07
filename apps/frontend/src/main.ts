import './style.css'
import { type NativeBridge, bridgeTransport } from '@pico-desktop/communicator'
import { Configurator, type State } from './configurator'
import { canWrite, connectionView, detailView, escape, importView, listStatus, paramRows, telemetryView } from './render'
import { mockBackend } from './mock-backend'
import type { ConnectRequest } from './generated/app'

declare global {
  interface Window {
    picoDesktop?: NativeBridge
  }
}

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const dialog = byId<HTMLDialogElement>('confirm')

function render(state: State) {
  const param = app.selectedParam()
  byId('connection').innerHTML = connectionView(state)
  byId('telemetry').innerHTML = telemetryView(state)
  const visible = app.visible()
  byId('list-status').textContent = listStatus(state, visible.length)
  byId('rows').innerHTML = paramRows(visible, state.selected)
  byId('detail').innerHTML = detailView(state, param)
  byId('edit').hidden = param === null || state.connection.state !== 'connected'
  byId<HTMLButtonElement>('write').disabled = !canWrite(state, param)
  byId<HTMLButtonElement>('disconnect-button').disabled = state.connection.state !== 'connected'
  byId<HTMLButtonElement>('refresh').disabled = state.connection.state !== 'connected' || state.list === 'loading'
  const device = byId<HTMLSelectElement>('device')
  const options = state.ports.map(p => `<option value="${escape(p.path)}">${escape(p.path)}${p.description ? ` (${escape(p.description)})` : ''}</option>`).join('')
  if (device.dataset.options !== options) {
    const chosen = device.value
    device.innerHTML = options || '<option value="">No serial ports</option>'
    device.dataset.options = options
    device.value = state.ports.some(p => p.path === chosen) ? chosen : (state.ports[0]?.path ?? '')
  }
  const loaded = state.importReview !== null || state.importError !== null
  byId('import-panel').hidden = !loaded
  byId('import').innerHTML = importView(state)
  byId<HTMLButtonElement>('apply').disabled = state.picked.length === 0 || state.applying || state.connection.state !== 'connected'
  byId<HTMLButtonElement>('backup').hidden = state.backup === null
  byId<HTMLButtonElement>('save').disabled = state.params.length === 0
  const draft = byId<HTMLInputElement>('draft')
  if (document.activeElement !== draft) {
    draft.value = state.draft
  }
}

function confirm(question: string): Promise<boolean> {
  byId('question').textContent = question
  dialog.returnValue = ''
  dialog.showModal()

  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true })
  })
}

// In Pico Desktop the native bridge; in a plain browser (`pnpm ui`) the mock backend.
const bridge = window.picoDesktop
const app: Configurator = new Configurator(bridge ? bridgeTransport(bridge) : mockBackend(), { render, confirm })

byId('connect').addEventListener('submit', event => {
  event.preventDefault()
  const transport = byId<HTMLSelectElement>('transport').value as ConnectRequest['transport']
  if (transport === 'serial') {
    const device = byId<HTMLSelectElement>('device').value
    void app.connect({ transport, ...(device ? { device } : {}), baud: Number(byId<HTMLSelectElement>('baud').value) })

    return
  }
  const host = byId<HTMLInputElement>('host').value.trim()
  const port = Number(byId<HTMLInputElement>('port').value.trim())
  void app.connect({ transport, ...(host ? { host } : {}), ...(port > 0 ? { port } : {}) })
})
// Host and port for UDP/TCP, device and baud rate for serial (listed when chosen).
byId('transport').addEventListener('change', event => {
  const serial = (event.target as HTMLSelectElement).value === 'serial'
  for (const id of ['host', 'port']) {
    byId(id).hidden = serial
  }
  for (const id of ['device', 'baud']) {
    byId(id).hidden = !serial
  }
  if (serial) {
    void app.listPorts()
  }
})
byId('disconnect-button').addEventListener('click', () => void app.disconnect())
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
byId('import').addEventListener('change', event => {
  const id = (event.target as HTMLElement).dataset.pick
  if (id) {
    app.togglePick(id)
  }
})
byId('apply').addEventListener('click', () => void app.applyImport())
byId('close-import').addEventListener('click', () => app.closeImport())
byId('draft').addEventListener('input', event => app.editDraft((event.target as HTMLInputElement).value))
byId('edit').addEventListener('submit', event => {
  event.preventDefault()
  void app.write()
})
render(app.state)
