// The commands that edit the plan: offered on the Plan page only, each with the reason it may not run, and each doing one
// thing to the plan.
import { describe, expect, it } from 'vitest'
import { fakeContext } from '@/testing/commandContext'
import {
  AddOnMap, AddWaypoint, DeleteItem, DuplicateItem, MoveItemDown, MoveItemUp, PLAN_GROUP, RedoPlan, UndoPlan,
} from './plan'

const onPlan = { path: '/plan' }

describe('where the commands of the plan are offered', () => {
  it('are in the Plan group, and are off away from the Plan page, saying so', () => {
    const away = fakeContext({ path: '/flight', planSelected: 1, planCanMove: true, planCanUndo: true, planCanRedo: true })
    const commands = [
      new AddWaypoint(),
      new AddOnMap(),
      new DuplicateItem(),
      new DeleteItem(),
      new MoveItemUp(),
      new MoveItemDown(),
      new UndoPlan(),
      new RedoPlan(),
    ]
    for (const command of commands) {
      expect(command.groupKey).toBe(PLAN_GROUP)
      expect(command.isEnabled(away.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.notOnPlan' })
    }
  })

  it('never ask, send nothing to a vehicle and need none', () => {
    const fake = fakeContext({ ...onPlan, connection: { state: 'disconnected' }, planSelected: 1 })
    new AddWaypoint().execute(fake.ctx)
    new DeleteItem().execute(fake.ctx)

    expect(fake.calls.confirm).toEqual([])
    expect(fake.calls.sent).toEqual([])
    expect(new AddWaypoint().isEnabled(fake.ctx)).toEqual({ enabled: true })
  })
})

describe('what the commands of the plan do', () => {
  it('adds a waypoint on the Plan page, unless the plan is full', () => {
    const fake = fakeContext(onPlan)
    expect(new AddWaypoint().isEnabled(fake.ctx)).toEqual({ enabled: true })
    expect(new AddWaypoint().execute(fake.ctx)).toEqual({ focus: 'main' })
    expect(fake.calls.plan).toEqual(['add 16'])
    fake.facts.planFull = true

    expect(new AddWaypoint().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.planFull' })
  })

  it('duplicates and deletes the selected item, and says to select one when none is', () => {
    const fake = fakeContext(onPlan)
    for (const command of [new DuplicateItem(), new DeleteItem()]) {
      expect(command.isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.noItemSelected' })
    }
    fake.facts.planSelected = 4
    new DuplicateItem().execute(fake.ctx)
    new DeleteItem().execute(fake.ctx)

    expect(fake.calls.plan).toEqual(['duplicate', 'remove'])
    fake.facts.planFull = true

    expect(new DuplicateItem().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.planFull' })
    // (a deletion needs no question: Undo gives the item back)
    expect(new DeleteItem().isEnabled(fake.ctx)).toEqual({ enabled: true })
  })
})

describe('the mode in which a click on the map adds a waypoint', () => {
  it('is turned on and off by the same command, and a full plan can leave it but not enter it', () => {
    const fake = fakeContext(onPlan)
    new AddOnMap().execute(fake.ctx)
    fake.facts.planAdding = true
    new AddOnMap().execute(fake.ctx)

    expect(fake.calls.plan).toEqual(['adding true', 'adding false'])
    fake.facts.planFull = true

    expect(new AddOnMap().isEnabled(fake.ctx)).toEqual({ enabled: true })
    fake.facts.planAdding = false

    expect(new AddOnMap().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.planFull' })
  })
})

describe('what the commands of the plan take back and move', () => {
  it('moves the selected item only where there is room, and undoes and redoes only what there is', () => {
    const fake = fakeContext(onPlan)
    expect(new MoveItemUp().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.cannotMove' })
    expect(new UndoPlan().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.nothingToUndo' })
    expect(new RedoPlan().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'plan.reason.nothingToRedo' })
    fake.facts.planCanMove = true
    fake.facts.planCanUndo = true
    fake.facts.planCanRedo = true
    new MoveItemUp().execute(fake.ctx)
    new MoveItemDown().execute(fake.ctx)
    new UndoPlan().execute(fake.ctx)
    new RedoPlan().execute(fake.ctx)

    expect(fake.calls.plan).toEqual(['move -1', 'move 1', 'undo', 'redo'])
  })
})
