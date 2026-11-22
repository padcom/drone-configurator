// The keys as a list to read: by scope, the whole window first.
import { describe, expect, it } from 'vitest'
import { type Binding, GLOBAL } from './bindings'
import { actionMessage, groupKeys, scopeMessage } from './keyGroups'

const key = (actionId: string, scope: string): Binding => ({ actionId, code: 'KeyK', scope, listens: 'keymap' })

describe('the groups of keys', () => {
  it('have the whole window first and the screens after it by name, each keeping the order of its keys', () => {
    const groups = groupKeys([key('a', 'plan'), key('b', GLOBAL), key('c', 'parameters'), key('d', 'plan'), key('e', GLOBAL)])

    expect(groups.map(group => group.scope)).toEqual([GLOBAL, 'parameters', 'plan'])
    expect(groups[0]?.keys.map(one => one.actionId)).toEqual(['b', 'e'])
    expect(groups[2]?.keys.map(one => one.actionId)).toEqual(['a', 'd'])
  })

  it('are none for no keys', () => {
    expect(groupKeys([])).toEqual([])
  })
})

describe('the messages', () => {
  it('are named by the action and by the scope', () => {
    expect(actionMessage('palette.open')).toBe('keys.action.palette.open')
    expect(scopeMessage(GLOBAL)).toBe('keys.scope.global')
    expect(scopeMessage('plan')).toBe('keys.scope.plan')
  })
})
