// How a parameter's unit is shown: centimetres as metres, centidegrees as degrees, every other unit as it is, and the conversion
// back for a typed value without a float's noise.
import { describe, expect, it } from 'vitest'
import { shownText, toDisplay, toStored, viewOf } from './units'

describe('the view of a unit', () => {
  it('converts the small units of ArduPilot to the ones a person reads', () => {
    expect(viewOf('cm')).toEqual({ unit: 'm', scale: 0.01, decimals: 2 })
    expect(viewOf('cm/s').unit).toBe('m/s')
    expect(viewOf('cdeg').unit).toBe('°')
    expect(viewOf('cdeg/s').unit).toBe('°/s')
    expect(viewOf('cm/s/s').unit).toBe('m/s²')
  })

  it('shows any other unit as the metadata says it, and no unit as none', () => {
    expect(viewOf('mAh')).toEqual({ unit: 'mAh', scale: 1 })
    expect(viewOf('V').scale).toBe(1)
    expect(viewOf(undefined)).toEqual({ unit: '', scale: 1 })
  })
})

describe('converting a value', () => {
  it('shows a stored value in the shown unit and takes a typed one back', () => {
    const view = viewOf('cm')

    expect(toDisplay(1234, view)).toBe(12.34)
    expect(toStored(12.34, view)).toBe(1234)
    expect(toStored(toDisplay(1500, view), view)).toBe(1500)
  })

  it('does not show or send the noise of a float', () => {
    const view = viewOf('cdeg')

    expect(toDisplay(2310, view)).toBe(23.1)
    expect(toStored(0.07, view)).toBe(7)
    expect(toStored(1.15, view)).toBe(115)
  })

  it('leaves a unit that is not converted as it is', () => {
    expect(toDisplay(3300, viewOf('mAh'))).toBe(3300)
    expect(toStored(3300, viewOf('mAh'))).toBe(3300)
  })
})

describe('the text of a shown value', () => {
  it('has the unit\'s decimals at most, without the zeros that end them', () => {
    expect(shownText(12.5, viewOf('cm'))).toBe('12.5')
    expect(shownText(12, viewOf('cm'))).toBe('12')
    expect(shownText(12.3456, viewOf('cm'))).toBe('12.35')
  })

  it('has as many decimals as the number needs where the unit says none', () => {
    expect(shownText(0.125, viewOf('V'))).toBe('0.125')
    expect(shownText(7, viewOf(undefined))).toBe('7')
  })
})
