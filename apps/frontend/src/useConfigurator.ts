// The Configurator's state for Vue components: one shallow ref per State field, each assigned only
// when its reference changed. Telemetry ticks every second; the 1200-row parameter list must not be
// diffed again on each tick, and a component that reads one field is not woken by the others.
import { type ShallowRef, shallowRef } from 'vue'
import type { Transport } from '@pico-desktop/communicator'
import { Configurator, type State } from './configurator'

/** One shallow ref per field of the Configurator's state. */
export type Fields = { [K in keyof State]: ShallowRef<State[K]> }

/** A question waiting for the user's answer. */
export interface Confirmation {
  /** What the user is asked. */
  question: string
  /** Settles the pending `Ui.confirm` promise. */
  answer: (yes: boolean) => void
}

/** What components get: the actions, the state as refs, and the pending question. */
export interface ConfiguratorHandle {
  /** The actions (`connect`, `select`, `write` ...). */
  app: Configurator
  /** The state, field by field. */
  fields: Fields
  /** The question the confirmation dialog shows, or null. */
  confirmation: ShallowRef<Confirmation | null>
}

/**
 * Builds a ref for every field of `state`.
 *
 * @param state the initial state
 * @returns the refs
 */
function toFields(state: State): Fields {
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, shallowRef(value)])) as Fields
}

/**
 * Assigns one field when its reference changed.
 *
 * @param fields the refs
 * @param state the new state
 * @param key the field
 */
function assign<K extends keyof State>(fields: Fields, state: State, key: K): void {
  if (fields[key].value !== state[key]) {
    fields[key].value = state[key]
  }
}

/**
 * Copies `state` into `fields`, touching only the refs whose value is not the same reference.
 *
 * @param fields the refs to update
 * @param state the Configurator's new state
 */
export function publish(fields: Fields, state: State): void {
  for (const key of Object.keys(state) as (keyof State)[]) {
    assign(fields, state, key)
  }
}

/**
 * Asks the user through the confirmation ref; the promise settles when the dialog answers.
 *
 * @param confirmation the ref the dialog shows
 * @param question what to ask
 * @returns whether the user said yes
 */
function ask(confirmation: ShallowRef<Confirmation | null>, question: string): Promise<boolean> {
  return new Promise(resolve => {
    const answer = (yes: boolean) => {
      confirmation.value = null
      resolve(yes)
    }
    confirmation.value = { question, answer }
  })
}

let current: ConfiguratorHandle | undefined

/**
 * Starts the Configurator on `transport` and makes it the one components get from
 * `useConfigurator()`.
 *
 * @param transport the link to the backend (the host's bridge, or the mock)
 * @param legacyRender the markup-based regions not yet ported to components, called after each change
 * @returns the handle
 */
export function createConfigurator(transport: Transport, legacyRender?: (state: State) => void): ConfiguratorHandle {
  const confirmation = shallowRef<Confirmation | null>(null)
  // The refs exist once the Configurator has its first state; it renders only after that (its
  // first change comes from the backend, asynchronously).
  const published: { fields?: Fields } = {}
  const app = new Configurator(transport, {
    render(state) {
      if (published.fields) {
        publish(published.fields, state)
      }
      legacyRender?.(state)
    },
    confirm: question => ask(confirmation, question),
  })
  const fields = toFields(app.state)
  published.fields = fields
  current = { app, fields, confirmation }

  return current
}

/**
 * The Configurator that `createConfigurator` started.
 *
 * @returns its handle
 */
export function useConfigurator(): ConfiguratorHandle {
  if (!current) {
    throw new Error('createConfigurator() has not been called')
  }

  return current
}
