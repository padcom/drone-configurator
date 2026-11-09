// The dashboard as HTML, from the state alone (no DOM), so rendering is testable in Vitest. The
// inputs (filter, draft, connection settings) are static elements in index.html: re-rendering
// them would take the focus away while the user types.
import type { Param } from './generated/app'
import type { State } from './configurator'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escape = (s: string) => s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c)

/** The selected parameter's details and how its last write went. */
export function detailView(state: State, param: Param | null): string {
  if (!param) {
    return '<p class="muted">Select a parameter to see or change it.</p>'
  }
  const meta = state.metadata.get(param.id)
  const named = meta?.values?.[String(param.value)]
  const units = meta?.units ? ` ${escape(meta.units)}` : ''
  const lines = [`<h3>${escape(param.id)}</h3>`, `<p>${escape(param.type)} · index ${param.index} · on the vehicle: <strong>${param.value}${units}</strong>${named ? ` (${escape(named)})` : ''}</p>`]
  if (meta?.description) {
    lines.push(`<p class="muted">${escape(meta.description)}</p>`)
  }
  if (meta && (meta.min !== undefined || meta.max !== undefined)) {
    lines.push(`<p class="muted">Range: ${meta.min ?? '…'} to ${meta.max ?? '…'}${units}</p>`)
  }
  if (meta?.values) {
    lines.push(`<p class="muted">Values: ${Object.entries(meta.values).map(([v, n]) => `${escape(v)} ${escape(n)}`).join(', ')}</p>`)
  }
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

/** A loaded snapshot: what it would change, what was applied, and the backup. */
export function importView(state: State): string {
  if (state.importError) {
    return `<p class="error">${escape(state.importError)}</p>`
  }
  const r = state.importReview
  if (!r) {
    return ''
  }
  const lines = [`<h3>Snapshot from ${escape(r.snapshot.savedAt)}</h3>`]
  if (r.vehicleWarning) {
    lines.push(`<p class="warn">It was ${escape(r.vehicleWarning)}.</p>`)
  }
  lines.push(`<p>${r.changes.length} differ, ${r.unchanged} already the same. Tick the ones to write.</p>`)
  lines.push('<ul class="changes">')
  for (const c of r.changes) {
    const from = c.from === null ? '—' : String(c.from)
    const checked = state.picked.includes(c.id) ? ' checked' : ''
    const disabled = c.problem !== null || state.applying ? ' disabled' : ''
    const why = c.problem ? ` <span class="muted">(${escape(c.problem)})</span>` : ''
    lines.push(`<li><label><input type="checkbox" data-pick="${escape(c.id)}"${checked}${disabled}> ${escape(c.id)}: ${from} → ${c.to}${why}</label></li>`)
  }
  lines.push('</ul>')
  for (const a of state.applied) {
    const cls = a.outcome === 'verified' ? 'ok' : a.outcome === 'changed' ? 'warn' : 'error'
    const text = a.outcome === 'verified' ? `written and read back: ${escape(a.detail)}` : escape(a.detail)
    lines.push(`<p class="${cls}">${escape(a.id)}: ${text}</p>`)
  }
  const last = state.applied.at(-1)
  const stopped = last !== undefined && last.outcome !== 'verified'
  if (stopped && !state.applying) {
    lines.push('<p class="warn">Stopped there: the rest weren\'t written.</p>')
  }

  return lines.join('')
}
