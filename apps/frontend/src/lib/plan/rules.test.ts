// What the page flags because the vehicle would misread it or refuses it: a waypoint at 0, 0 or at altitude 0, an altitude out
// of range or below home, a takeoff that does not go up, a set home or a ROI that names a place and has none, and a plan that
// is too long; and what the sketch and the numbers do not take for a place or a comparison.
import { describe, expect, it } from 'vitest'
import { COMMANDS, definitionOf, freshItem, placeNeeded } from './catalog'
import { sketchOf, statsOf } from './geometry'
import { FRAME_ABSOLUTE, MAX_ALTITUDE, MAX_ITEMS, type Plan, type PlanItem, emptyPlan } from './model'
import { problemsOf } from './validate'

/**
 * A plan of one takeoff and then items of commands, each with places a little apart.
 *
 * @param commands the MAV_CMDs after the takeoff
 * @returns the plan
 */
function planOf(...commands: number[]): Plan {
  const plan = emptyPlan()
  const all = [22, ...commands]
  all.forEach((command, index) => {
    plan.items.push({ ...freshItem(definitionOf(command)!, plan, index + 1), lat: 52 + index / 400, lon: 21 })
  })

  return plan
}

/**
 * Changes the last item of a plan.
 *
 * @param plan the plan
 * @param patch what changes
 */
function change(plan: Plan, patch: Partial<PlanItem>): void {
  Object.assign(plan.items.at(-1) as PlanItem, patch)
}

/**
 * The problems of a plan as short texts: level, key and the number of the item (from 1).
 *
 * @param plan the plan
 * @param limit how many items the vehicle takes, once known
 * @returns the texts
 */
function keys(plan: Plan, limit: number | null = null): string[] {
  return problemsOf(plan, limit).map(problem => `${problem.level}:${problem.key}:${problem.params?.number ?? '-'}`)
}

describe('a waypoint or a loiter the vehicle would misread', () => {
  it('flags 0, 0 for the four commands that fly to a place, and does not take it for a place', () => {
    for (const command of [16, 17, 18, 19]) {
      const plan = planOf(command)
      change(plan, { lat: 0, lon: 0 })

      expect(keys(plan), String(command)).toEqual(['error:atZero:2'])
      expect(sketchOf(plan).points.map(point => point.number)).toEqual([1])
    }
  })

  it('warns of an altitude of 0 above home for them, and of one below home for any command', () => {
    const plan = planOf(16)
    change(plan, { alt: 0 })

    expect(keys(plan)).toEqual(['warning:zeroAltitude:2'])
    change(plan, { alt: -5 })

    expect(keys(plan)).toEqual(['warning:altNegative:2'])
    change(plan, { alt: 0, frame: FRAME_ABSOLUTE })

    expect(keys(plan)).toEqual([])
  })
})

describe('an altitude out of range', () => {
  it('refuses an altitude beyond what the page takes, and says it is not set when it is not a number', () => {
    const plan = planOf(16)
    change(plan, { alt: MAX_ALTITUDE + 1 })

    expect(keys(plan)).toEqual(['error:altHigh:2'])
    change(plan, { alt: null })

    expect(keys(plan)).toEqual(['error:noAltitude:2'])
  })
})

describe('a takeoff', () => {
  it('needs an altitude above 0, with or without a place', () => {
    const plan = planOf()
    change(plan, { alt: 0 })

    expect(keys(plan)).toEqual(['error:takeoffAltitude:1'])
    change(plan, { alt: null, lat: null, lon: null })

    expect(keys(plan)).toEqual(['error:noAltitude:1'])
    change(plan, { alt: 10 })

    expect(keys(plan)).toEqual([])
  })
})

describe('an item that names a place', () => {
  it('needs one: set home given here, and a ROI at a place (the vehicle would take where it is)', () => {
    const home = planOf(179)
    change(home, { lat: null, lon: null })
    const roi = planOf(201)
    change(roi, { lat: null, lon: null })

    expect(keys(home)).toEqual(['error:noPlace:2'])
    expect(keys(roi)).toEqual(['error:noPlace:2'])
    expect(placeNeeded(home.items[1] as PlanItem, definitionOf(179)!)).toBe(true)
  })

  it('does not need one where the vehicle is asked for where it is, and has no choice of an item for a ROI', () => {
    const home = planOf(179)
    change(home, { lat: null, lon: null, p1: 0 })
    const roi = definitionOf(201)!.fields[0]!

    expect(keys(home)).toEqual([])
    expect(roi.choices?.map(choice => choice.value)).toEqual([0, 1, 3])
  })
})

describe('the size of the plan', () => {
  it('is over the page\'s limit, and over the vehicle\'s once it has said what that is', () => {
    const plan = planOf(16, 16)

    expect(keys(plan, 2)).toEqual(['error:overVehicle:-'])
    expect(keys(plan, 3)).toEqual([])
    plan.items = Array.from({ length: MAX_ITEMS + 1 }, (_, index) => ({ ...(plan.items[1] as PlanItem), id: index + 1 }))

    expect(keys(plan)).toContain('error:tooMany:-')
  })
})

describe('the numbers of the plan', () => {
  it('compare altitudes only where they are measured from the same thing', () => {
    const plan = planOf(16)
    change(plan, { alt: 450, frame: FRAME_ABSOLUTE })

    expect(statsOf(plan).highest).toBeNull()
    change(plan, { alt: 30, frame: plan.items[0]?.frame })

    expect(statsOf(plan).highest).toBe(30)
  })

  it('keep the catalog complete: 16 commands, the four that fly to a place being 16 to 19', () => {
    expect(COMMANDS.filter(def => def.nav && def.place === 'required').map(def => def.command)).toEqual([16, 17, 18, 19])
  })
})
