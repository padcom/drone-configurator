// Where a context menu is drawn: at the point, moved just far enough to stay in the window.
import { describe, expect, it } from 'vitest'
import { EDGE_PX, belowLeftOf, placed } from './contextPlace'

const VIEW = { width: 1000, height: 700 }
const MENU = { width: 200, height: 150 }

describe('placing a menu', () => {
  it('is at the point when it fits', () => {
    expect(placed({ x: 300, y: 200 }, MENU, VIEW)).toEqual({ left: 300, top: 200 })
  })

  it('moves left and up from the far edges, as far as it must', () => {
    expect(placed({ x: 900, y: 650 }, MENU, VIEW)).toEqual({ left: 1000 - EDGE_PX - 200, top: 700 - EDGE_PX - 150 })
    expect(placed({ x: 790, y: 540 }, MENU, VIEW)).toEqual({ left: 790, top: 540 })
  })

  it('never goes past the near edges, also when it is larger than the window', () => {
    expect(placed({ x: -50, y: -10 }, MENU, VIEW)).toEqual({ left: EDGE_PX, top: EDGE_PX })
    expect(placed({ x: 10, y: 10 }, { width: 2000, height: 900 }, VIEW)).toEqual({ left: EDGE_PX, top: EDGE_PX })
  })
})

describe('the point for the keyboard', () => {
  it('is the lower left of the element that has the focus', () => {
    expect(belowLeftOf({ left: 40, bottom: 120 })).toEqual({ x: 40, y: 120 })
  })
})
