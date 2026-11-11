import { describe, expect, it } from 'vitest'
import { INTENT_MS, askForFocus, focusAsked, takeFocus, takeFocusFor } from './useFocusIntent'

describe('the intent to put the focus somewhere once it is shown', () => {
  it('is taken once, and only for the place it names', () => {
    askForFocus('params.search', 1000)

    expect(takeFocus('main', 1001)).toBe(false)
    expect(takeFocus('params.search', 1002)).toBe(true)
    expect(takeFocus('params.search', 1003)).toBe(false)
  })

  it('is ignored, and gone, once it is stale: it never takes the focus when the user opens the screen later on their own', () => {
    askForFocus('params.search', 1000)

    expect(takeFocus('params.search', 1000 + INTENT_MS + 1)).toBe(false)
    expect(takeFocus('params.search', 1000 + INTENT_MS + 2)).toBe(false)
  })
})

describe('the intent to put the focus in the value editor of a parameter', () => {
  it('is taken only by the editor that shows that parameter, and only once', () => {
    askForFocus('params.value', 1000, 'RTL_ALT')

    expect(takeFocusFor('params.value', 'FENCE_RADIUS', 1001)).toBe(false)
    expect(takeFocusFor('params.value', 'RTL_ALT', 1002)).toBe(true)
    expect(takeFocusFor('params.value', 'RTL_ALT', 1003)).toBe(false)
  })

  it('for a parameter\'s value editor goes stale like the others', () => {
    askForFocus('params.value', 1000, 'RTL_ALT')

    expect(takeFocusFor('params.value', 'RTL_ALT', 1000 + INTENT_MS + 1)).toBe(false)
  })

  it('changes `focusAsked` each time it is asked for, so that what waits can look again', () => {
    const before = focusAsked.value

    askForFocus('params.value', 1000, 'RTL_ALT')

    expect(focusAsked.value).toBe(before + 1)
    takeFocus('params.value', 1001)
  })

  it('is replaced by a newer one', () => {
    askForFocus('params.search', 1000)
    askForFocus('params.search', 9000)

    expect(takeFocus('params.search', 9001)).toBe(true)
  })
})
