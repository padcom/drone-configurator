import { describe, expect, it } from 'vitest'
import type { State } from './configurator'
import { canWrite, connectionView, detailView, escape, listStatus, paramRows, telemetryView } from './render'
import { PARAMS, VEHICLE, telemetryAt } from './fixtures'

const base: State = {
  connection: { state: 'connected', vehicle: { ...VEHICLE } },
  params: PARAMS,
  list: 'complete',
  missing: [],
  filter: '',
  selected: null,
  draft: '',
  draftError: null,
  writing: false,
  lastWrite: null,
  telemetry: null,
  error: null,
  notice: null,
  importReview: null,
  importError: null,
  picked: [],
  applying: false,
  applied: [],
  backup: null,
  ports: [],
}
const param = PARAMS.find(p => p.id === 'RTL_ALT')!

describe('rendering', () => {
  it('shows the connection and vehicle, escaping text', () => {
    expect(connectionView(base)).toContain('system 1/1 · QUADROTOR · ARDUPILOTMEGA')
    expect(connectionView({ ...base, connection: { state: 'disconnected' }, error: '<oops>' })).toContain('&lt;oops&gt;')
    expect(escape(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;')
  })

  it('shows telemetry cards', () => {
    const html = telemetryView({ ...base, telemetry: telemetryAt(10) })
    expect(html).toContain('LOITER')
    expect(html).toContain('ARMED')
    expect(html).toContain('12.50 V · 90%')
    expect(telemetryView(base)).toContain('No telemetry')
  })

  it('says how complete the list is', () => {
    expect(listStatus(base, PARAMS.length)).toBe('12 parameters')
    expect(listStatus(base, 2)).toBe('2 of 12 parameters')
    expect(listStatus({ ...base, list: 'incomplete', missing: [3, 7] }, 12)).toContain('2 never arrived (indexes 3, 7)')
  })

  it('marks the selected row', () => {
    const rows = paramRows(PARAMS.slice(0, 3), 'BATT_CAPACITY')
    expect(rows).toContain('<tr data-id="BATT_CAPACITY" class="selected">')
    expect(rows.match(/<tr /g)?.length).toBe(3)
  })

  it('describes each write outcome', () => {
    const s = { ...base, selected: param.id }
    expect(detailView({ ...s, lastWrite: { kind: 'verified', id: param.id, value: 2000 } }, param)).toContain('Written and read back: 2000.')
    expect(detailView({ ...s, lastWrite: { kind: 'changed', id: param.id, asked: 2000, reported: 1999 } }, param)).toContain('reports 1999, not 2000')
    expect(detailView({ ...s, lastWrite: { kind: 'failed', id: param.id, message: 'TIMEOUT: no reply' } }, param)).toContain('The value on the vehicle is unknown')
    expect(detailView(s, null)).toContain('Select a parameter')
  })

  it('enables writing only for a valid, changed value while connected', () => {
    const s = { ...base, selected: param.id }
    expect(canWrite({ ...s, draft: '2000' }, param)).toBe(true)
    expect(canWrite({ ...s, draft: String(param.value) }, param)).toBe(false)
    expect(canWrite({ ...s, draft: '2000', draftError: 'bad' }, param)).toBe(false)
    expect(canWrite({ ...s, draft: '2000', connection: { state: 'lost' } }, param)).toBe(false)
    expect(canWrite({ ...s, draft: '2000', writing: true }, param)).toBe(false)
  })
})
