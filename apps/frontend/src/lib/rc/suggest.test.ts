import { describe, expect, it } from 'vitest'
import { addRow } from './edits'
import { freeChannel, newButton, newSwitch, suggestedProfile } from './suggest'
import { factsOf } from './vehicle'

/**
 * What a vehicle says of its channels, with the functions given.
 *
 * @param options the `RCn_OPTION` of the channels that have one
 * @returns the facts
 */
function vehicle(options: Record<number, number> = {}) {
  const sticks = ['ROLL', 'PITCH', 'THROTTLE', 'YAW']
  const params = sticks.map((name, index) => ({ id: `RCMAP_${name}`, value: index + 1 }))

  for (let channel = 1; channel <= 16; channel += 1) {
    params.push({ id: `RC${channel}_OPTION`, value: options[channel] ?? 0 })
  }

  return factsOf(params, true)
}

describe('the rows that are added', () => {
  it('is a switch with the usual pulses and a button with its two, each on the channel and the control it is given', () => {
    expect(newSwitch(6, 5)).toEqual({ kind: 'switch', channel: 6, axis: 5, invert: false, pulses: [1000, 1500, 2000] })
    expect(newButton(7, 2)).toEqual({ kind: 'button', channel: 7, button: 2, off: 1000, on: 2000 })
  })
})

describe('the channel of a row that is added', () => {
  const profile = suggestedProfile('pad', null)

  it('is the lowest after the sticks that no row drives', () => {
    expect(freeChannel(profile, null)).toBe(5)
    expect(freeChannel(addRow(profile, newSwitch(5, 4)), null)).toBe(6)
  })

  it('is never a channel the vehicle arms or stops with', () => {
    expect(freeChannel(profile, vehicle({ 5: 153, 6: 31 }))).toBe(7)
    expect(freeChannel(profile, vehicle({ 5: 7 }))).toBe(5)
  })

  it('is one of the first four when all after them are taken, and none when nothing is free', () => {
    const sixteen = Array.from({ length: 12 }, (_, index) => newSwitch(index + 5, 4))
    const full = sixteen.reduce(addRow, profile)
    const gap = { ...full, rows: full.rows.filter(row => row.channel !== 2) }

    expect(freeChannel(full, null)).toBeNull()
    expect(freeChannel(gap, null)).toBe(2)
  })
})
