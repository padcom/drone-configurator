import { describe, expect, it } from 'vitest'
import { DEFAULT_MAIN, DEFAULT_SIDE, MAX, MIN, useFlightLayout } from './flightLayout'

describe('the layout at the start', () => {
  it('has the defaults, nothing collapsed, and the telemetry tab', () => {
    const layout = useFlightLayout()

    expect([layout.main.value, layout.side.value, layout.tab.value]).toEqual([DEFAULT_MAIN, DEFAULT_SIDE, 'telemetry'])
    expect((['map', 'hud', 'detail'] as const).map(pane => layout.isCollapsed(pane))).toEqual([false, false, false])
  })

  it('takes the sizes and the tab it is given', () => {
    const layout = useFlightLayout({ main: 30, side: 70, tab: 'values' })

    expect([layout.main.value, layout.side.value, layout.tab.value]).toEqual([30, 70, 'values'])
  })
})

describe('collapsing the map', () => {
  it('goes to the smallest share, and opens at the size it had, also when that was changed meanwhile', () => {
    const layout = useFlightLayout()
    layout.main.value = 72

    layout.toggle('map')
    expect([layout.main.value, layout.isCollapsed('map')]).toEqual([MIN, true])
    layout.toggle('map')

    expect([layout.main.value, layout.isCollapsed('map')]).toEqual([72, false])
  })

  it('is collapsed also when the bar was dragged to the end, and opens at the size it had before', () => {
    const layout = useFlightLayout()
    layout.main.value = 55
    layout.toggle('map')
    layout.toggle('map')
    layout.main.value = MIN

    expect(layout.isCollapsed('map')).toBe(true)
    layout.toggle('map')

    expect(layout.main.value).toBe(55)
  })
})

describe('collapsing the map, from the start or by the bar', () => {
  it('opens at the default when it was collapsed from the start', () => {
    const layout = useFlightLayout({ main: MIN })

    layout.toggle('map')

    expect(layout.main.value).toBe(DEFAULT_MAIN)
  })
})

describe('the display and the details', () => {
  it('share one split: collapsing one is opening the other', () => {
    const layout = useFlightLayout()

    layout.toggle('hud')
    expect([layout.side.value, layout.isCollapsed('hud'), layout.isCollapsed('detail')]).toEqual([MIN, true, false])
    layout.toggle('detail')
    expect([layout.side.value, layout.isCollapsed('hud'), layout.isCollapsed('detail')]).toEqual([MAX, false, true])
  })

  it('open at the size they had', () => {
    const layout = useFlightLayout()
    layout.side.value = 25

    layout.toggle('detail')
    layout.toggle('detail')

    expect([layout.side.value, layout.isCollapsed('hud'), layout.isCollapsed('detail')]).toEqual([25, false, false])
  })

  it('the one that is open is not changed by opening the other from collapsed', () => {
    const layout = useFlightLayout()
    layout.toggle('hud')
    layout.toggle('hud')

    expect(layout.side.value).toBe(DEFAULT_SIDE)
  })
})

describe('the size a pane opens at', () => {
  it('is the last size it was open at, also when a bar was dragged shut, not only when its button was used', () => {
    const layout = useFlightLayout()

    layout.main.value = 80
    layout.main.value = MIN
    layout.toggle('map')

    expect(layout.main.value).toBe(80)
  })

  it('is kept for the display and for the details too, at sizes that are not the default', () => {
    const layout = useFlightLayout()
    layout.side.value = 25
    layout.side.value = MIN
    layout.toggle('hud')
    expect(layout.side.value).toBe(25)

    layout.side.value = 70
    layout.side.value = MAX
    layout.toggle('detail')

    expect(layout.side.value).toBe(70)
  })
})

describe('the size a pane opens at, and the ends', () => {
  it('does not remember an end as a size to open at', () => {
    const layout = useFlightLayout()
    layout.side.value = 30
    layout.side.value = MIN
    layout.side.value = MAX
    layout.toggle('detail')

    expect(layout.side.value).toBe(30)
  })
})

describe('the map taking all the width', () => {
  it('leaves the display and the details no more than a header: both count as collapsed, the map does not', () => {
    const layout = useFlightLayout()

    layout.main.value = MAX

    expect((['map', 'hud', 'detail'] as const).map(pane => layout.isCollapsed(pane))).toEqual([false, true, true])
  })

  it('is undone by the button of either: the map gives back the width it had, and nothing is collapsed', () => {
    const layout = useFlightLayout()
    layout.main.value = 72
    layout.main.value = MAX

    layout.toggle('hud')

    expect([layout.main.value, layout.side.value]).toEqual([72, DEFAULT_SIDE])
    expect((['map', 'hud', 'detail'] as const).map(pane => layout.isCollapsed(pane))).toEqual([false, false, false])
    layout.main.value = MAX
    layout.toggle('detail')
    expect(layout.main.value).toBe(72)
  })
})

describe('the map taking all the width, from the start', () => {
  it('gives back the default width when it started like that', () => {
    const layout = useFlightLayout({ main: MAX })

    layout.toggle('detail')

    expect(layout.main.value).toBe(DEFAULT_MAIN)
  })
})
