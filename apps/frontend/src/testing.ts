// Helpers for component tests (not part of the app).
import type { State } from './configurator'
import { i18n } from './i18n'
import { type ConfiguratorHandle, publish } from './useConfigurator'

/** Mount options that give a component the translations, as `mountIsland` does in the page. */
export const withI18n = { global: { plugins: [i18n] } }

/**
 * Looks up an English message, for the tests of the functions that take a `translate`.
 *
 * @param key the message
 * @param named the values in it
 * @returns the text
 */
export const translate = (key: string, named: Record<string, unknown> = {}): string => i18n.global.t(key, named)

/**
 * Changes the Configurator's state the way the backend's events would. The state goes through the Configurator: a
 * ref written directly is overwritten by its next render.
 *
 * @param handle the started Configurator
 * @param change the fields to change
 */
export function feed(handle: ConfiguratorHandle, change: Partial<State>): void {
  handle.app.state = { ...handle.app.state, ...change }
  publish(handle.fields, handle.app.state)
}
