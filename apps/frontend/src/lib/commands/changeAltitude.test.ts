// Change altitude as a command and its flow: when it may run (an armed vehicle in the air, near a stop, not coming home, with
// the whole
// parameter list), that it only opens the dialog, and that the flow puts the vehicle in GUIDED first when it is not in it,
// looks at the vehicle
// again, and sends ONE change of altitude, stopping at the first step that does not go.
import { afterEach, describe, expect, it } from 'vitest'
import { BackendError } from '@/backend/client'
import { setLanguage } from '@/i18n/i18n'
import { GUIDED_DEFAULTS } from '@/lib/fly/guided'
import { fakeContext } from '@/testing/commandContext'
import { inTheAir } from '@/testing/guided'
import { ChangeAltitude } from './changeAltitude'
import { changeAltitude } from './changeAltitudeFlow'

afterEach(() => {
  setLanguage('en')
})

const command = new ChangeAltitude()
const WAITS = { pollMs: 5, modeMs: 500, armMs: 300 }
const FASTER = inTheAir({ position: { ...inTheAir().position!, vx: 4 } })

/**
 * A vehicle that is armed in GUIDED, in the air and near a stop, as a test changes it.
 *
 * @param change what is different
 * @returns the fake context
 */
function ready(change: Parameters<typeof fakeContext>[0] = {}): ReturnType<typeof fakeContext> {
  return fakeContext({ armed: true, mode: 'GUIDED', telemetry: inTheAir(), ...change })
}

describe('when a change of altitude may run', () => {
  it('may for an armed vehicle in the air that is near a stop, whether or not a place is picked', () => {
    expect(command.isEnabled(ready().ctx)).toEqual({ enabled: true })
    expect(command.isEnabled(ready({ target: { lat: 1, lon: 1 } }).ctx)).toEqual({ enabled: true })
  })

  it.each([
    ['without a vehicle', { connection: { state: 'disconnected' as const } }, 'palette.reason.notConnected'],
    ['when the state is not known', { armed: undefined }, 'palette.reason.stateUnknown'],
    ['when the vehicle is not armed', { armed: false }, 'palette.reason.notArmed'],
    ['while parameters are written', { busy: 'writing' as const }, 'palette.reason.writing'],
    ['without the complete parameter list', { listComplete: false }, 'guided.reason.params'],
    ['while the vehicle moves fast', { telemetry: FASTER }, 'guided.reason.moving'],
    ['when the vehicle is coming home', { telemetry: inTheAir({ mode: 'RTL' }) }, 'guided.reason.landing'],
  ])('may not %s, and says why', (_name, facts, reasonKey) => {
    expect(command.isEnabled(ready(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })

  it('is dangerous, asks nothing itself and only opens the dialog', async () => {
    const fake = ready()

    expect(command.dangerous).toBe(true)
    expect('confirmation' in command).toBe(false)
    await command.execute(fake.ctx)

    expect(fake.calls.dialogs).toEqual(['altitude'])
    expect(fake.calls.sent).toEqual([])
  })
})

describe('what the button does', () => {
  it('sends ONE change of altitude to a vehicle that is in GUIDED, with the failsafe policy of the setting', async () => {
    const fake = ready({ guidedPrefs: { ...GUIDED_DEFAULTS, failsafe: 'warn' } })

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(true)
    expect(fake.calls.sent).toEqual(['altitude 30 warn'])
    expect(fake.calls.toast.at(-1)?.text).toBe('QUADROTOR accepted: it holds here and goes to 30 m above home.')
  })
})

describe('what the button does about the mode', () => {
  it('puts the vehicle in GUIDED first when it is not in it, and goes on once the heartbeat says so', async () => {
    const fake = ready({ mode: 'LOITER' })
    const set = fake.ctx.vehicle.setMode.bind(fake.ctx.vehicle)
    fake.ctx.vehicle.setMode = async mode => {
      const answer = await set(mode)
      setTimeout(() => {
        fake.facts.mode = 'GUIDED'
      }, 10)

      return answer
    }

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(true)
    expect(fake.calls.sent).toEqual(['mode 4', 'altitude 30 block'])
  })
})

describe('what the button does when the vehicle changed meanwhile', () => {
  it('says that the vehicle stays in GUIDED when it is looked at again and found moving, and sends nothing more', async () => {
    const fake = ready({ mode: 'LOITER' })
    const set = fake.ctx.vehicle.setMode.bind(fake.ctx.vehicle)
    fake.ctx.vehicle.setMode = async mode => {
      const answer = await set(mode)
      fake.facts.telemetry = FASTER
      fake.facts.mode = 'GUIDED'

      return answer
    }

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['mode 4'])
    expect(fake.calls.toast.at(-1)?.text).toBe(
      'The vehicle is moving: wait until it has stopped, or try again. The vehicle was put in GUIDED and stays there.',
    )
  })
})

describe('what the flow takes once', () => {
  it('sends the failsafe policy it had when it started, even if the choice changes during the wait for GUIDED', async () => {
    const fake = ready({ mode: 'LOITER', guidedPrefs: { ...GUIDED_DEFAULTS, failsafe: 'warn' } })
    const set = fake.ctx.vehicle.setMode.bind(fake.ctx.vehicle)
    fake.ctx.vehicle.setMode = async mode => {
      const answer = await set(mode)
      fake.facts.guidedPrefs = { ...GUIDED_DEFAULTS, failsafe: 'block' }
      fake.facts.mode = 'GUIDED'

      return answer
    }

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(true)
    expect(fake.calls.sent).toEqual(['mode 4', 'altitude 30 warn'])
  })
})

describe('what the button tells when it does not go', () => {
  it('tells what the backend refused, in words, and sends nothing else', async () => {
    const fake = ready({ armingError: new BackendError('VEHICLE_MOVING', 'x') })

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(false)
    expect(fake.calls.toast.at(-1)?.text).toBe('The vehicle is moving: wait until it has stopped, or try again.')
  })

  it('tells a refusal of the vehicle, and does not send it again', async () => {
    const fake = ready({ armingResult: { result: 'refused', messages: [] } })

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['altitude 30 block'])
    expect(fake.calls.toast.at(-1)?.text).toBe('QUADROTOR refused to change its altitude.')
  })

  it('does not send it again when nothing answered, and says it may be changing its altitude', async () => {
    const fake = ready({ armingResult: { result: 'no-answer', messages: [] } })

    expect(await changeAltitude(fake.ctx, 30, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['altitude 30 block'])
    expect(fake.calls.toast.at(-1)?.text).toContain('is not sent again')
  })

  it('says the failsafe warning that came with an accepted change', async () => {
    const warning = 'FS_GCS_ENABLE is 0: if the link drops, it keeps its last command'
    const fake = ready({ armingResult: { result: 'accepted', messages: [warning] } })
    await changeAltitude(fake.ctx, 30, WAITS)

    expect(fake.calls.toast.some(toast => toast.text.includes('FS_GCS_ENABLE is 0'))).toBe(true)
  })
})
