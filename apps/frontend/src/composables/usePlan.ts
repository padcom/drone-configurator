// The plan the Plan page edits: one for the whole page, kept while the application runs (a plan is not lost by looking at another
// screen). Every change is an edit (lib/plan/edit.ts) done through the history, so Undo and Redo take back and do again
// whatever was done, the palette's commands included. Offline: nothing here is sent to a vehicle.
import { type ComputedRef, computed, reactive, ref } from 'vue'
import { COMMANDS, type CommandDef, definitionOf, freshItem } from '@/lib/plan/catalog'
import { AddItem, MoveItem, RemoveItem, RenamePlan, UpdateItem } from '@/lib/plan/edit'
import { type Sketch, type Stats, sketchOf, statsOf } from '@/lib/plan/geometry'
import { History } from '@/lib/plan/history'
import { type Plan, type PlanDocument, type PlanItem, emptyPlan, indexOfItem } from '@/lib/plan/model'
import { type Problem, problemsOf } from '@/lib/plan/validate'

/** The plan and what is selected in it. */
const doc: PlanDocument = reactive({ plan: emptyPlan(), selected: null })
const history = new History()
/** Goes up with every edit, so that what asks the history (it is not reactive) is asked again. */
const revision = ref(0)
let nextId = 1

/** What the screen reads of the plan. */
export interface PlanView {
  /** The plan. */
  plan: ComputedRef<Plan>
  /** The id of the selected item, or null. */
  selected: ComputedRef<number | null>
  /** The selected item, or null. */
  item: ComputedRef<PlanItem | null>
  /** What is wrong with the plan. */
  problems: ComputedRef<Problem[]>
  /** The numbers of the stats strip. */
  stats: ComputedRef<Stats>
  /** The picture of the route. */
  sketch: ComputedRef<Sketch>
  /** Whether there is an edit to take back. */
  canUndo: ComputedRef<boolean>
  /** Whether there is an edit to do again. */
  canRedo: ComputedRef<boolean>
  /** The message that says what Undo takes back (null when there is nothing). */
  undoLabelKey: ComputedRef<string | null>
  /** The message that says what Redo does again (null when there is nothing). */
  redoLabelKey: ComputedRef<string | null>
}

/** What the screen and the commands do to the plan. */
export interface PlanActions {
  /** Selects an item (null: none). */
  select(id: number | null): void
  /** Adds a new item of a command after the selected one (at the end when none is selected), and selects it. */
  add(command: number): void
  /** Adds a copy of the selected item after it, and selects the copy. */
  duplicate(): void
  /** Takes the selected item out; the one that takes its place is selected. */
  remove(): void
  /** Moves the selected item up or down the list. */
  move(by: -1 | 1): void
  /** Changes some fields of an item. */
  update(id: number, patch: Partial<PlanItem>): void
  /** Gives the plan another name. */
  rename(name: string): void
  /** Takes the last edit back. */
  undo(): void
  /** Does the edit that was taken back again. */
  redo(): void
}

/** What the screen and the commands use. */
export type PlanState = PlanView & PlanActions

/**
 * Does an edit and tells whoever asks the history that it changed.
 *
 * @param edit the edit
 */
function run(edit: AddItem | RemoveItem | MoveItem | UpdateItem | RenamePlan): void {
  history.run(doc, edit)
  revision.value += 1
}

/**
 * The definition of the command an item of the plan is, or the waypoint's.
 *
 * @param command the MAV_CMD
 * @returns it
 */
function definitionOrWaypoint(command: number): CommandDef {
  return definitionOf(command) ?? (COMMANDS[1] as CommandDef)
}

/**
 * The position of the selected item, or -1.
 *
 * @returns the index
 */
function selectedIndex(): number {
  return doc.selected === null ? -1 : indexOfItem(doc.plan, doc.selected)
}

/**
 * Where a new item goes: after the selected one, else at the end.
 *
 * @returns the index
 */
function insertionIndex(): number {
  const at = selectedIndex()

  return at < 0 ? doc.plan.items.length : at + 1
}

/**
 * The next id for an item.
 *
 * @returns it
 */
function newId(): number {
  nextId += 1

  return nextId - 1
}

/**
 * Whether the selected item can go up or down the list.
 *
 * @param by which way
 * @returns whether it can
 */
function canMoveBy(by: number): boolean {
  const to = selectedIndex() + by

  return selectedIndex() >= 0 && to >= 0 && to < doc.plan.items.length
}

/**
 * What is read of the plan.
 *
 * @returns the computed values
 */
function view(): PlanView {
  const selectedItem = computed(() => doc.plan.items.find(item => item.id === doc.selected) ?? null)

  return {
    plan: computed(() => doc.plan),
    selected: computed(() => doc.selected),
    item: selectedItem,
    problems: computed(() => problemsOf(doc.plan)),
    stats: computed(() => statsOf(doc.plan)),
    sketch: computed(() => sketchOf(doc.plan)),
    canUndo: computed(() => revision.value >= 0 && history.canUndo()),
    canRedo: computed(() => revision.value >= 0 && history.canRedo()),
    undoLabelKey: computed(() => (revision.value >= 0 ? history.undoLabelKey() : null)),
    redoLabelKey: computed(() => (revision.value >= 0 ? history.redoLabelKey() : null)),
  }
}

/**
 * Selecting, and taking back and doing again.
 *
 * @returns the actions
 */
function navigation(): Pick<PlanActions, 'select' | 'undo' | 'redo'> {
  return {
    select: id => {
      doc.selected = id
    },
    undo: () => {
      history.undo(doc)
      revision.value += 1
    },
    redo: () => {
      history.redo(doc)
      revision.value += 1
    },
  }
}

/**
 * What changes the plan.
 *
 * @returns the actions
 */
function changes(): Omit<PlanActions, 'select' | 'undo' | 'redo'> {
  return {
    add: command => {
      run(new AddItem(freshItem(definitionOrWaypoint(command), doc.plan, newId()), insertionIndex()))
    },
    duplicate: () => {
      const item = doc.plan.items[selectedIndex()]
      if (item) {
        run(new AddItem({ ...item, id: newId() }, selectedIndex() + 1))
      }
    },
    remove: () => {
      if (doc.selected !== null) {
        run(new RemoveItem(doc.selected))
      }
    },
    move: by => {
      if (canMoveBy(by)) {
        run(new MoveItem(doc.selected as number, by))
      }
    },
    update: (id, patch) => run(new UpdateItem(id, patch)),
    rename: name => run(new RenamePlan(name)),
  }
}

/**
 * The plan of the page.
 *
 * @returns the plan, what is derived of it, and what can be done to it
 */
export function usePlan(): PlanState {
  return { ...view(), ...navigation(), ...changes() }
}

/** For the tests: an empty plan and an empty history. */
export function resetPlanForTests(): void {
  doc.plan = emptyPlan()
  doc.selected = null
  history.clear()
  revision.value += 1
  nextId = 1
}
