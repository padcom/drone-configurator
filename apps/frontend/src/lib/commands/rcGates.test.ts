// While the RC control is on the sticks fly the vehicle, and no guided command is offered (the backend refuses them too): the
// commands that go to the vehicle by GUIDED say why, and the same reason is in the Go here rules.
import { describe, expect, it } from 'vitest'
import { goHereBlock } from '@/lib/fly/guided'
import { fakeContext } from '@/testing/commandContext'
import { ready } from '@/testing/takeoff'
import { ChangeAltitude } from './changeAltitude'
import { GoHere } from './goHere'
import { SetHomeHere } from './setHomeHere'
import { TakeOff } from './takeoff'

const COMMANDS = [new TakeOff(), new GoHere(), new ChangeAltitude(), new SetHomeHere()]

describe('the guided commands while RC control is on', () => {
  it.each(COMMANDS.map(command => [command.id, command] as const))('does not offer %s, and says why', (_id, command) => {
    for (const rcState of ['on', 'starting'] as const) {
      const { ctx } = fakeContext({ armed: true, telemetry: ready({ armed: true }), rcState })

      expect(command.isEnabled(ctx)).toEqual({ enabled: false, reasonKey: 'guided.reason.rcControl' })
    }
  })

  it.each(COMMANDS.map(command => [command.id, command] as const))('does not say it for %s when it is off', (_id, command) => {
    const { ctx } = fakeContext({ armed: true, telemetry: ready({ armed: true }), rcState: 'off' })
    const available = command.isEnabled(ctx)

    expect(available.enabled || available.reasonKey !== 'guided.reason.rcControl').toBe(true)
  })
})

describe('the rules of a Go here', () => {
  const prefs = fakeContext().ctx.preferences.guided()
  const base = { telemetry: ready({ armed: true }), listComplete: true, target: null, prefs }

  it('refuse first while RC control is on, whatever else is missing', () => {
    expect(goHereBlock({ ...base, rcControl: true })).toBe('rcControl')
    expect(goHereBlock({ ...base, rcControl: true, listComplete: false })).toBe('rcControl')
  })

  it('do not mention it when it is off', () => {
    expect(goHereBlock({ ...base, rcControl: false, listComplete: false })).toBe('params')
    expect(goHereBlock({ ...base, listComplete: false })).toBe('params')
  })
})
