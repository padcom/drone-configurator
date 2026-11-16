// What can be done to the plan, and taken back: items put in, taken out, moved and changed, the jumps that name them following
// along, typing in a field being one edit, and Undo and Redo giving back exactly what was.
import { describe, expect, it } from 'vitest'
import { COMMANDS, definitionOf, freshItem } from './catalog'
import { AddItem, MERGE_MS, MoveItem, RemoveItem, RenamePlan, UpdateItem } from './edit'
import { History } from './history'
import { type PlanDocument, type PlanItem, emptyPlan } from './model'

/**
 * A document with `count` waypoints (ids 1 to count), nothing selected.
 *
 * @param count how many waypoints
 * @returns the document
 */
function documentOf(count: number): PlanDocument {
  const doc: PlanDocument = { plan: emptyPlan(), selected: null }
  const waypoint = definitionOf(16)!
  for (let id = 1; id <= count; id += 1) {
    doc.plan.items.push({ ...freshItem(waypoint, doc.plan, id), lat: 52 + id / 1000, lon: 21 })
  }

  return doc
}

/**
 * A jump to an item, as the form has it.
 *
 * @param doc the document
 * @param id the jump's id
 * @param to the number of the item it goes on from
 * @returns the jump
 */
function jump(doc: PlanDocument, id: number, to: number | null): PlanItem {
  return { ...freshItem(definitionOf(177)!, doc.plan, id), p1: to }
}

const ids = (doc: PlanDocument): number[] => doc.plan.items.map(item => item.id)
const targetOf = (doc: PlanDocument, id: number): number | null | undefined => doc.plan.items.find(item => item.id === id)?.p1

describe('putting items in', () => {
  it('puts an item in and selects it, and takes it out again with Undo', () => {
    const doc = documentOf(2)
    const history = new History()
    history.run(doc, new AddItem(freshItem(definitionOf(22)!, doc.plan, 9), 1))

    expect(ids(doc)).toEqual([1, 9, 2])
    expect(doc.selected).toBe(9)
    history.undo(doc)

    expect(ids(doc)).toEqual([1, 2])
    expect(doc.selected).toBeNull()
    history.redo(doc)

    expect(ids(doc)).toEqual([1, 9, 2])
  })
})

describe('taking items out', () => {
  it('takes an item out, selects the one that takes its place, and gives it back with Undo', () => {
    const doc = documentOf(3)
    const history = new History()
    doc.selected = 2
    history.run(doc, new RemoveItem(2))

    expect(ids(doc)).toEqual([1, 3])
    expect(doc.selected).toBe(3)
    history.undo(doc)

    expect(ids(doc)).toEqual([1, 2, 3])
    expect(doc.selected).toBe(2)
    expect(doc.plan.items[1]?.lat).toBe(52.002)
  })
})

describe('taking the last items out', () => {
  it('selects the one before when the last is taken out, and none when the only one is', () => {
    const doc = documentOf(2)
    const history = new History()
    history.run(doc, new RemoveItem(2))

    expect(doc.selected).toBe(1)
    history.run(doc, new RemoveItem(1))

    expect(doc.selected).toBeNull()
  })

  it('does nothing for an item that is not there', () => {
    const doc = documentOf(1)
    const history = new History()
    history.run(doc, new RemoveItem(77))
    history.undo(doc)

    expect(ids(doc)).toEqual([1])
  })
})

describe('the jumps that name items', () => {
  it('follow the items when one is put in before their target, and come back with Undo', () => {
    const doc = documentOf(3)
    doc.plan.items.push(jump(doc, 10, 3), jump(doc, 11, 1))
    const history = new History()
    // a new item as number 2: the target 3 is now number 4, the target 1 stays
    history.run(doc, new AddItem(freshItem(definitionOf(16)!, doc.plan, 20), 1))

    expect(targetOf(doc, 10)).toBe(4)
    expect(targetOf(doc, 11)).toBe(1)
    history.undo(doc)

    expect(targetOf(doc, 10)).toBe(3)
  })
})

describe('the jumps that name items taken out', () => {
  it('follow the items when one is taken out before their target, and lose it when the target itself is', () => {
    const doc = documentOf(3)
    doc.plan.items.push(jump(doc, 10, 3), jump(doc, 11, 1))
    const history = new History()
    history.run(doc, new RemoveItem(1))

    // (the target 3 is number 2 now, the one that went was number 1: that jump has no target any more)
    expect(targetOf(doc, 10)).toBe(2)
    expect(targetOf(doc, 11)).toBeNull()
    history.undo(doc)

    expect(targetOf(doc, 10)).toBe(3)
    expect(targetOf(doc, 11)).toBe(1)
  })
})

describe('the jumps that name items moved', () => {
  it('follow two items that swap places', () => {
    const doc = documentOf(3)
    doc.plan.items.push(jump(doc, 10, 1), jump(doc, 11, 2), jump(doc, 12, 3))
    const history = new History()
    history.run(doc, new MoveItem(1, 1))

    expect(ids(doc).slice(0, 3)).toEqual([2, 1, 3])
    expect(doc.plan.items.map(item => item.p1).slice(3)).toEqual([2, 1, 3])
    history.undo(doc)

    expect(ids(doc).slice(0, 3)).toEqual([1, 2, 3])
    expect(doc.plan.items.map(item => item.p1).slice(3)).toEqual([1, 2, 3])
  })
})

describe('changing an item', () => {
  it('changes it and takes the change back', () => {
    const doc = documentOf(1)
    const history = new History()
    history.run(doc, new UpdateItem(1, { alt: 35 }))

    expect(doc.plan.items[0]?.alt).toBe(35)
    history.undo(doc)

    expect(doc.plan.items[0]?.alt).toBe(20)
  })
})

describe('typing in a field', () => {
  it('makes one edit of the changes of a field that come quickly after each other (typing)', () => {
    const doc = documentOf(1)
    const history = new History()
    history.run(doc, new UpdateItem(1, { alt: 3 }, 1000), 1000)
    history.run(doc, new UpdateItem(1, { alt: 35 }, 1500), 1500)
    history.run(doc, new UpdateItem(1, { alt: 350 }, 2000), 2000)

    expect(doc.plan.items[0]?.alt).toBe(350)
    history.undo(doc)

    // one Undo takes back all the typing
    expect(doc.plan.items[0]?.alt).toBe(20)
    expect(history.canUndo()).toBe(false)
    history.redo(doc)

    expect(doc.plan.items[0]?.alt).toBe(350)
  })
})

describe('typing that is not one edit', () => {
  it('does not join a change that comes late, one of another field or one of another item', () => {
    const doc = documentOf(2)
    const history = new History()
    const late = 1000 + MERGE_MS
    history.run(doc, new UpdateItem(1, { alt: 30 }, 1000), 1000)
    history.run(doc, new UpdateItem(1, { alt: 40 }, late + 1), late + 1)
    history.run(doc, new UpdateItem(1, { p1: 5 }, late + 2), late + 2)
    history.run(doc, new UpdateItem(2, { alt: 50 }, late + 3), late + 3)
    history.undo(doc)
    history.undo(doc)
    history.undo(doc)

    expect(doc.plan.items[0]?.alt).toBe(30)
    expect(history.canUndo()).toBe(true)
  })
})

describe('naming the plan', () => {
  it('renames the plan, typing in one edit', () => {
    const doc = documentOf(0)
    const history = new History()
    history.run(doc, new RenamePlan('N'), 100)
    history.run(doc, new RenamePlan('North'), 200)

    expect(doc.plan.name).toBe('North')
    history.undo(doc)

    expect(doc.plan.name).toBe('')
  })
})

describe('the history', () => {
  it('forgets what could be redone when something new is done, and says what it would take back', () => {
    const doc = documentOf(1)
    const history = new History()
    history.run(doc, new UpdateItem(1, { alt: 30 }, 0), 0)
    history.undo(doc)

    expect(history.canRedo()).toBe(true)
    expect(history.redoLabelKey()).toBe('plan.edit.change')
    history.run(doc, new RemoveItem(1))

    expect(history.canRedo()).toBe(false)
    expect(history.undoLabelKey()).toBe('plan.edit.remove')
  })
})

describe('the size of the history', () => {
  it('is bounded', () => {
    const doc = documentOf(0)
    const history = new History()
    for (let i = 0; i < 300; i += 1) {
      history.run(doc, new RenamePlan(`${i}`, i * 10_000), i * 10_000)
    }
    let undone = 0
    while (history.undo(doc)) {
      undone += 1
    }

    expect(undone).toBe(200)
  })
})

describe('an empty history', () => {
  it('says nothing when there is nothing to undo or redo', () => {
    const history = new History()

    expect(history.undo(documentOf(0))).toBe(false)
    expect(history.redo(documentOf(0))).toBe(false)
    expect(history.undoLabelKey()).toBeNull()
  })
})

describe('the catalog', () => {
  it('has the sixteen commands the backend knows the rules of, each once', () => {
    const commands = COMMANDS.map(def => def.command).sort((a, b) => a - b)

    expect(commands).toEqual([16, 17, 18, 19, 20, 21, 22, 112, 177, 178, 179, 181, 183, 201, 203, 206])
    expect(new Set(COMMANDS.map(def => def.id)).size).toBe(16)
  })
})
