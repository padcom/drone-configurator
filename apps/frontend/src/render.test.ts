import { describe, expect, it } from 'vitest'
import { escape } from './render'

describe('rendering', () => {
  it('escapes text', () => {
    expect(escape(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;')
  })
})
