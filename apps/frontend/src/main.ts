import './style.css'
import { type NativeBridge, bridgeTransport } from '@pico-desktop/communicator'
import { Configurator, type State } from './configurator'
import { canWrite, connectionView, detailView, listStatus, paramRows, telemetryView } from './render'
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
  const host = byId<HTMLInputElement>('host').value.trim()
  const port = Number(byId<HTMLInputElement>('port').value.trim())
  void app.connect({ transport, ...(host ? { host } : {}), ...(port > 0 ? { port } : {}) })
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
byId('draft').addEventListener('input', event => app.editDraft((event.target as HTMLInputElement).value))
byId('edit').addEventListener('submit', event => {
  event.preventDefault()
  void app.write()
})
render(app.state)
