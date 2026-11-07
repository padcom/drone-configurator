// The dashboard as HTML, from the state alone (no DOM), so rendering is testable in Vitest. The
// inputs (filter, draft, connection settings) are static elements in index.html: re-rendering
// them would take the focus away while the user types.
import type { Param } from './generated/app'
import type { State } from './configurator'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escape = (s: string) => s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c)

const fixed = (n: number, digits: number) => n.toFixed(digits)

/** The connection's state, the vehicle, and why the last attempt failed. */
export function connectionView(state: State): string {
  const c = state.connection
  const vehicle = c.vehicle
    ? ` · system ${c.vehicle.sysid}/${c.vehicle.compid} · ${escape(c.vehicle.type)} · ${escape(c.vehicle.autopilot)}`
    : ''
  const error = state.error ? `<span class="error">${escape(state.error)}</span>` : ''

  return `<span class="badge ${c.state}">${c.state}</span>${vehicle} ${error}`
}

/** Heartbeat, mode, armed state, battery and attitude, or a placeholder without a vehicle. */
export function telemetryView(state: State): string {
  const t = state.telemetry
  if (!t) {
    return '<p class="muted">No telemetry: connect to a vehicle.</p>'
  }
  const battery = t.batteryRemaining === undefined ? '' : ` · ${t.batteryRemaining}%`
  const cards: [string, string, string?][] = [
    ['Mode', escape(t.mode)],
    ['State', t.armed ? 'ARMED' : 'disarmed', t.armed ? 'warn' : undefined],
    ['Battery', `${fixed(t.batteryVoltage, 2)} V${battery}`],
    ['Attitude', `roll ${fixed(t.roll, 1)}° · pitch ${fixed(t.pitch, 1)}° · yaw ${fixed(t.yaw, 0)}°`],
    ['Heartbeat', `${t.heartbeatAgeMs} ms ago`, t.heartbeatAgeMs > 3000 ? 'warn' : undefined],
  ]

  return cards.map(([label, value, cls]) => `<div class="card${cls ? ` ${cls}` : ''}"><span>${label}</span><strong>${value}</strong></div>`).join('')
}

/** How the parameter list stands. */
export function listStatus(state: State, shown: number): string {
  switch (state.list) {
    case 'none': return 'Connect to download the parameters.'
    case 'loading': return 'Downloading the parameters…'
    case 'failed': return 'The download failed.'
    case 'incomplete': return `${state.params.length} parameters, but ${state.missing.length} never arrived (indexes ${state.missing.join(', ')}). Download again to retry.`
    case 'complete': return shown === state.params.length ? `${state.params.length} parameters` : `${shown} of ${state.params.length} parameters`
  }
}

/** The parameter table's rows; the selected one is marked. */
export function paramRows(params: Param[], selected: string | null): string {
  return params.map(p => {
    const cls = p.id === selected ? ' class="selected"' : ''

    return `<tr data-id="${escape(p.id)}"${cls}><td>${escape(p.id)}</td><td class="num">${p.value}</td><td>${escape(p.type)}</td></tr>`
  }).join('')
}

/** The selected parameter's details and how its last write went. */
export function detailView(state: State, param: Param | null): string {
  if (!param) {
    return '<p class="muted">Select a parameter to see or change it.</p>'
  }
  const lines = [`<h3>${escape(param.id)}</h3>`, `<p>${escape(param.type)} · index ${param.index} · on the vehicle: <strong>${param.value}</strong></p>`]
  if (state.draftError) {
    lines.push(`<p class="error">${escape(state.draftError)}</p>`)
  }
  const w = state.lastWrite
  if (state.writing) {
    lines.push('<p>Writing… waiting for the vehicle to report the new value.</p>')
  } else if (w && w.id === param.id) {
    switch (w.kind) {
      case 'verified':
        lines.push(`<p class="ok">Written and read back: ${w.value}.</p>`)
        break
      case 'changed':
        lines.push(`<p class="warn">The vehicle reports ${w.reported}, not ${w.asked}: it changed or refused the value.</p>`)
        break
      case 'failed':
        lines.push(`<p class="error">Not confirmed: ${escape(w.message)}. The value on the vehicle is unknown; download again to see it.</p>`)
        break
    }
  }

  return lines.join('')
}

/** Whether the write button does anything now. */
export function canWrite(state: State, param: Param | null): boolean {
  return param !== null && state.connection.state === 'connected' && !state.writing && state.draftError === null
    && state.draft.trim() !== '' && Number(state.draft) !== param.value
}
