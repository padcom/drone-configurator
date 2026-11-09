// Helpers for component tests (not part of the app).
import { i18n } from './i18n'
import type { State } from './state'
import type { ConfiguratorHandle, Fields } from './useConfigurator'

/** Mount options that give a component the translations, as `mountIsland` does in the page. */
export const withI18n = { global: { plugins: [i18n] } }

/**
 * Waits until the next frame has been drawn: what was published once per frame has been published by then.
 *
 * @returns a promise that resolves after the next animation frame
 */
export function nextFrame(): Promise<void> {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      resolve()
    })
  })
}

/**
 * Looks up an English message, for the tests of the functions that take a `translate`.
 *
 * @param key the message
 * @param named the values in it
 * @returns the text
 */
export const translate = (key: string, named: Record<string, unknown> = {}): string => i18n.global.t(key, named)

/**
 * Sets one field.
 *
 * @param fields the refs
 * @param change the new values
 * @param key the field to set
 */
function assign<K extends keyof State>(fields: Fields, change: Partial<State>, key: K): void {
  fields[key].value = change[key] as State[K]
}

/**
 * Changes the state the way the backend's events would, by setting the refs that hold it.
 *
 * @param handle the started Configurator
 * @param change the fields to change
 */
export function feed(handle: ConfiguratorHandle, change: Partial<State>): void {
  for (const key of Object.keys(change) as (keyof State)[]) {
    assign(handle.fields, change, key)
  }
}
