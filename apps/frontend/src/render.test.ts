import { describe, expect, it } from 'vitest'
import type { State } from './configurator'
import { escape, listStatus, paramRows } from './render'
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

})
