// What is wrong with a plan, the distances and picture of a route from the places alone, and what the vehicle keeps of what is
// typed.
import { describe, expect, it } from 'vitest'
import { COMMANDS, definitionOf, freshItem, keptAltitude, keptValue } from './catalog'
import { distanceBetween, pinsOf, statsOf } from './geometry'
import { MAX_ITEMS, type Plan, type PlanItem, emptyPlan } from './model'
import { problemsOf } from './validate'

/**
 * A plan with items of commands, each at a place a few hundred metres from the one before.
 *
 * @param commands the MAV_CMDs
 * @returns the plan
 */
function planOf(...commands: number[]): Plan {
  const plan = emptyPlan()
  commands.forEach((command, index) => {
    plan.items.push({ ...freshItem(definitionOf(command)!, plan, index + 1), lat: 52 + index / 400, lon: 21 })
  })

  return plan
}

/**
 * Changes an item of a plan.
 *
 * @param plan the plan
 * @param index which item (from 0)
 * @param patch what changes
 */
function change(plan: Plan, index: number, patch: Partial<PlanItem>): void {
  Object.assign(plan.items[index] as PlanItem, patch)
}

/**
 * The problems of a plan as short texts: level, key and the id of the item.
 *
 * @param plan the plan
 * @returns the texts
 */
function keys(plan: Plan): string[] {
  return problemsOf(plan).map(problem => `${problem.level}:${problem.key}:${problem.itemId ?? '-'}`)
}

describe('what is wrong with a place', () => {
  it('finds nothing wrong with a takeoff and a waypoint with places set', () => {
    expect(keys(planOf(22, 16))).toEqual([])
  })

  it('says a waypoint with no place needs one, and a place off the globe is off', () => {
    const plan = planOf(22, 16)
    change(plan, 1, { lat: null })
    change(plan, 0, { lat: 91 })

    expect(keys(plan)).toEqual(['error:offGlobe:1', 'error:noPlace:2'])
  })
})

describe('what is wrong with a field', () => {
  it('says a field that is not a number, or is outside what it takes, is wrong', () => {
    const plan = planOf(22, 16)
    change(plan, 1, { p1: null })

    expect(keys(plan)).toContain('error:number:2')
    change(plan, 1, { p1: -3 })

    expect(keys(plan)).toContain('error:low:2')
    change(plan, 1, { p1: 70000 })

    expect(keys(plan)).toContain('error:high:2')
  })
})

describe('what is wrong with a yaw and a jump', () => {
  it('takes a yaw that is left out for a waypoint, and not for a command that takes none', () => {
    const plan = planOf(22, 16, 178)

    expect(keys(plan)).toEqual([])
    change(plan, 2, { p4: null })

    expect(keys(plan)).toEqual(['error:number:3'])
  })

  it('says a jump needs a target that is an item of the plan', () => {
    const plan = planOf(22, 16, 177)
    change(plan, 2, { p1: 2 })

    expect(keys(plan)).toEqual([])

    for (const to of [null, 0, 4, 1.5]) {
      change(plan, 2, { p1: to })

      expect(keys(plan)).toContain('error:jumpTarget:3')
    }
  })
})

describe('what is wrong with the plan as a whole', () => {
  it('warns when the first thing the vehicle flies to is not a takeoff, and not for one that is', () => {
    expect(keys(planOf(16, 16))).toEqual(['warning:noTakeoff:-'])
    expect(keys(planOf(22, 16))).toEqual([])
    expect(keys(planOf(178, 22, 16))).toEqual([])
    expect(keys(emptyPlan())).toEqual([])
  })

  it('says a plan with too many items has too many', () => {
    const plan = planOf(22)
    const item = plan.items[0] as PlanItem
    plan.items = Array.from({ length: MAX_ITEMS + 1 }, (_, index) => ({ ...item, id: index + 1 }))

    expect(keys(plan)).toContain('error:tooMany:-')
  })
})

describe('the distances', () => {
  it('measures the route through the places that are set, and says nothing for fewer than two', () => {
    const plan = planOf(22, 16, 16)
    const far = distanceBetween({ lat: 52, lon: 21 }, { lat: 52.005, lon: 21 })

    expect(statsOf(plan).items).toBe(3)
    expect(Math.round(statsOf(plan).distance ?? 0)).toBe(Math.round(far))
    expect(statsOf(planOf(22)).distance).toBeNull()
    expect(statsOf(emptyPlan())).toEqual({ items: 0, distance: null, highest: null })
  })

  it('says the highest altitude of the items that fly, and none when there is none', () => {
    const plan = planOf(22, 16)
    change(plan, 0, { alt: 10 })
    change(plan, 1, { alt: 45 })

    expect(statsOf(plan).highest).toBe(45)
    expect(statsOf(planOf(178)).highest).toBeNull()
  })
})

describe('the pins of the map', () => {
  it('are the items that have a place, in the order of the route, with the numbers the list has', () => {
    const plan = planOf(22, 16, 16)
    change(plan, 1, { lat: null, lon: null })
    const pins = pinsOf(plan)

    expect(pins.map(pin => pin.number)).toEqual([1, 3])
    expect(pins.map(pin => pin.id)).toEqual([plan.items[0]!.id, plan.items[2]!.id])
    expect(pins[0]).toMatchObject({ lat: plan.items[0]!.lat, lon: plan.items[0]!.lon })
  })

  it('are none for an empty plan, and a lone place is one', () => {
    expect(pinsOf(planOf(22))).toHaveLength(1)
    expect(pinsOf(emptyPlan())).toEqual([])
  })
})

describe('what the vehicle keeps of what is typed', () => {
  it('keeps the whole number of a hold time, and says so only when it is not what was typed', () => {
    const hold = definitionOf(16)!.fields[0]!

    expect(keptValue(hold, 1.5)).toBe(1)
    expect(keptValue(hold, 2)).toBeNull()
    expect(keptValue(hold, null)).toBeNull()
    expect(keptValue(definitionOf(112)!.fields[0]!, 1.5)).toBeNull()
  })

  it('keeps an altitude to the centimetre', () => {
    expect(keptAltitude(25.004)).toBe(25)
    expect(keptAltitude(25.12)).toBeNull()
    expect(keptAltitude(null)).toBeNull()
  })
})

describe('what the vehicle keeps of a loiter', () => {
  it('has a loiter radius whose sign is the direction', () => {
    const def = definitionOf(17)!
    const radius = def.fields.find(field => field.id === 'radius')!
    const direction = def.fields.find(field => field.id === 'direction')!
    const item = freshItem(def, emptyPlan(), 1)

    expect(radius.read(item)).toBe(20)
    expect(direction.read(item)).toBe(1)
    const left = { ...item, ...direction.write(item, -1) }

    expect(left.p3).toBe(-20)
    expect(radius.read(left)).toBe(20)
    expect({ ...left, ...radius.write(left, 35) }.p3).toBe(-35)
  })

  it('has a field for every parameter the vehicle keeps and none for one it drops', () => {
    // a waypoint keeps only its first parameter; a change of speed no place
    expect(definitionOf(16)!.fields).toHaveLength(1)
    expect(definitionOf(178)!.place).toBe('none')
    expect(COMMANDS.every(def => def.fields.every(field => field.labelKey.startsWith('plan.field.')))).toBe(true)
  })
})
