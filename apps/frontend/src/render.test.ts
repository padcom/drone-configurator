import { describe, expect, it } from 'vitest'
import type { State } from './configurator'
import { escape } from './render'
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
})
