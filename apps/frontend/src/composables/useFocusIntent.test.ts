import { describe, expect, it } from 'vitest'
import { INTENT_MS, askForFocus, takeFocus } from './useFocusIntent'

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

  it('is replaced by a newer one', () => {
    askForFocus('params.search', 1000)
    askForFocus('params.search', 9000)

    expect(takeFocus('params.search', 9001)).toBe(true)
  })
})
