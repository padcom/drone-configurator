import { describe, expect, it } from 'vitest'
import type { State } from './configurator'
import { canWrite, detailView, escape, listStatus, paramRows } from './render'
import { PARAMS, VEHICLE } from './fixtures'

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
  metadata: new Map(),
  metadataError: null,
}
const param = PARAMS.find(p => p.id === 'RTL_ALT')!

describe('rendering', () => {
  it('escapes text', () => {
    expect(escape(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;')
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
