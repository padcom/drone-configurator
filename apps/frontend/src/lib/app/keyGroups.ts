// The keys as a list for a person to read: by scope (the whole window first, then the screens by name), each in the order of
// the table.
import { type Binding, GLOBAL } from './bindings'

/** The keys of one scope. */
export interface KeyGroup {
  /** `global`, or the screen. */
  scope: string
  /** Its keys. */
  keys: Binding[]
}

/**
 * The name of the message that says what an action is.
 *
 * @param actionId the action
 * @returns the key of the message
 */
export function actionMessage(actionId: string): string {
  return `keys.action.${actionId}`
}

/**
 * The name of the message that names a scope.
 *
 * @param scope the scope
 * @returns the key of the message
 */
export function scopeMessage(scope: string): string {
  return scope === GLOBAL ? 'keys.scope.global' : `keys.scope.${scope}`
}

/**
 * Puts the keys in groups by scope: the whole window first, the screens after it by name.
 *
 * @param keys the keys
 * @returns the groups, with no empty one
 */
export function groupKeys(keys: readonly Binding[]): KeyGroup[] {
  const first = (scope: string): number => Number(scope !== GLOBAL)
  const scopes = [...new Set(keys.map(key => key.scope))].sort((a, b) => first(a) - first(b) || a.localeCompare(b))

  return scopes.map(scope => ({ scope, keys: keys.filter(key => key.scope === scope) }))
}
