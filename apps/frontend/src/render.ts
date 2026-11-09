// The dashboard as HTML, from the state alone (no DOM), so rendering is testable in Vitest. The
// inputs (filter, draft, connection settings) are static elements in index.html: re-rendering
// them would take the focus away while the user types.
import type { State } from './configurator'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escape = (s: string) => s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c)

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
