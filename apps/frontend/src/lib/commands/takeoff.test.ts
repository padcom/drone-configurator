// Take off as a command, and what its button does (takeoffFlow.ts): when the command may run (a connected vehicle whose state is
// known, with a 3D fix and the EKF's position, on the ground), that it only opens the dialog, and that the flow goes one step
// after the other (GUIDED, arm with its review and hold, the takeoff) and stops at the first that does not go, sending the
// takeoff once.
import { afterEach, describe, expect, it } from 'vitest'
import { BackendError } from '@/backend/client'
import { setLanguage } from '@/i18n/i18n'
import { fakeContext } from '@/testing/commandContext'
import { ready } from '@/testing/takeoff'
import { TakeOff } from './takeoff'
import { type ArmOutcome, takeOff } from './takeoffFlow'

afterEach(() => {
  setLanguage('en')
})

const command = new TakeOff()
// (generous: a wait that is not needed ends at once, and only a test of a wait that runs out takes this long)
const WAITS = { pollMs: 5, modeMs: 500, armMs: 300 }
const IN_THE_AIR = { ...ready().position!, relativeAltitude: 5 }

describe('when a takeoff may run', () => {
  it('is enabled for a connected vehicle that is ready, armed or not', () => {
    expect(command.isEnabled(fakeContext({ armed: false, telemetry: ready() }).ctx)).toEqual({ enabled: true })
    expect(command.isEnabled(fakeContext({ armed: true, telemetry: ready({ armed: true }) }).ctx)).toEqual({ enabled: true })
  })

  it.each([
    ['without a vehicle', { connection: { state: 'disconnected' as const } }, 'palette.reason.notConnected'],
    ['when the state is not known', { armed: undefined, telemetry: ready() }, 'palette.reason.stateUnknown'],
    ['while parameters are written', { busy: 'writing' as const, telemetry: ready() }, 'palette.reason.writing'],
    ['without a 3D fix', { telemetry: ready({ gps: { fixType: 2, ageMs: 1 } }) }, 'palette.reason.takeoff.gps'],
    ['without the EKF\'s position', { telemetry: ready({ ekf: undefined }) }, 'palette.reason.takeoff.ekf'],
    ['in the air', { telemetry: ready({ position: IN_THE_AIR }) }, 'palette.reason.takeoff.air'],
    ['when the vehicle reports nothing', { telemetry: null }, 'palette.reason.takeoff.gps'],
  ])('is not enabled %s, and says why', (_name, facts, reasonKey) => {
    expect(command.isEnabled(fakeContext(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })

  it('is dangerous (never boosted by use), asks nothing itself and only opens the dialog', async () => {
    const fake = fakeContext({ telemetry: ready() })

    expect(command.dangerous).toBe(true)
    expect('confirmation' in command).toBe(false)
    await command.execute(fake.ctx)

    expect(fake.calls.dialogs).toEqual(['takeoff'])
    expect(fake.calls.sent).toEqual([])
  })
})

/**
 * Runs the flow with an arm that says what a test wants.
 *
 * @param fake the context
 * @param armed what the vehicle says after the arm: true arms it, false does nothing
 * @param outcome what the arm command came to (it was accepted, unless a test says another)
 * @param meanwhile something that happens while the arm is asked for (another party arms the vehicle)
 * @returns how many times the arm was asked for
 */
async function fly(
  fake: ReturnType<typeof fakeContext>,
  armed: boolean,
  outcome: ArmOutcome = 'accepted',
  meanwhile?: () => void,
): Promise<number> {
  let asked = 0
  await takeOff(fake.ctx, 12, () => {
    asked += 1
    meanwhile?.()

    if (armed) {
      fake.facts.telemetry = ready({ armed: true })
    }

    return Promise.resolve(outcome)
  }, WAITS)

  return asked
}

/**
 * A vehicle that is armed and in GUIDED, as a test changes it.
 *
 * @param change what is different
 * @returns the fake context
 */
function flying(change: Parameters<typeof fakeContext>[0] = {}): ReturnType<typeof fakeContext> {
  return fakeContext({ armed: true, mode: 'GUIDED', telemetry: ready({ armed: true }), ...change })
}

describe('what the Take off button does: the way up', () => {
  it('takes off at once an armed vehicle that is in GUIDED, and says what the vehicle answered', async () => {
    const fake = flying()

    expect(await fly(fake, false)).toBe(0)
    expect(fake.calls.sent).toEqual(['takeoff 12'])
    expect(fake.calls.toast[0]?.text).toBe('QUADROTOR accepted the takeoff to 12 m. It climbs when its position says so.')
  })

  it('arms a disarmed vehicle (the hold is the arm command\'s), waits for the heartbeat, and then takes off, once', async () => {
    const fake = fakeContext({ armed: false, mode: 'GUIDED', telemetry: ready() })

    expect(await fly(fake, true)).toBe(1)
    expect(fake.calls.sent).toEqual(['takeoff 12'])
    expect(fake.calls.dialogs).toEqual([])
  })
})

describe('what the Take off button does: the mode', () => {
  it('puts the vehicle in GUIDED first, waits for the heartbeat to say so, and only then goes on', async () => {
    const fake = flying({ mode: 'LOITER' })
    const set = fake.ctx.vehicle.setMode.bind(fake.ctx.vehicle)
    fake.ctx.vehicle.setMode = async mode => {
      const answer = await set(mode)
      setTimeout(() => {
        fake.facts.mode = 'GUIDED'
      }, 10)

      return answer
    }
    await fly(fake, false)

    // (GUIDED is mode 4 of a Copter)
    expect(fake.calls.sent).toEqual(['mode 4', 'takeoff 12'])
  })
})

describe('what the Take off button does: it stops at the first step that does not go', () => {
  it('shows the review when the vehicle says its checks do not pass: no arm, no takeoff', async () => {
    const failing = ready({ prearm: { enabled: true, passing: false, ageMs: 1 } })
    const fake = fakeContext({ armed: false, mode: 'GUIDED', telemetry: failing })

    expect(await fly(fake, true)).toBe(0)
    expect(fake.calls.dialogs).toEqual(['review'])
    expect(fake.calls.sent).toEqual([])
    expect(fake.calls.toast[0]?.text).toContain('review them, arm, and take off again')
  })
})

describe('what the Take off button does: it stops when the arm does not come', () => {
  it('sends no takeoff when the heartbeat does not say armed in time', async () => {
    const fake = fakeContext({ armed: false, mode: 'GUIDED', telemetry: ready() })

    expect(await fly(fake, false)).toBe(1)
    expect(fake.calls.sent).toEqual([])
    expect(fake.calls.toast[0]?.text).toContain('did not say it is armed')
  })

  it('sends no takeoff when the vehicle\'s state is not known', async () => {
    const fake = fakeContext({ armed: undefined, mode: 'GUIDED', telemetry: ready() })

    expect(await fly(fake, true)).toBe(0)
    expect(fake.calls.sent).toEqual([])
  })
})

describe('what the Take off button does: an arm that was not made', () => {
  it.each(['cancelled', 'refused', 'unsupported', 'not-sent'] as const)(
    'stops at once, sending no takeoff, when the arm is %s: even if the vehicle is armed by someone else soon after',
    async outcome => {
      const fake = fakeContext({ armed: false, mode: 'GUIDED', telemetry: ready() })
      // (a radio switch, another ground station: the heartbeat says armed while the question is answered with no)
      const otherParty = (): void => {
        fake.facts.telemetry = ready({ armed: true })
      }

      expect(await fly(fake, false, outcome, otherParty)).toBe(1)

      expect(fake.calls.sent).toEqual([])
      expect(fake.calls.toast[0]?.text).toContain('arm was not confirmed')
    },
  )
})

describe('what the Take off button does: an arm that was made', () => {
  it('goes on to wait for the heartbeat after an arm that was accepted, and after one that nothing answered', async () => {
    const accepted = fakeContext({ armed: false, mode: 'GUIDED', telemetry: ready() })
    const silent = fakeContext({ armed: false, mode: 'GUIDED', telemetry: ready() })
    await fly(accepted, true, 'accepted')
    await fly(silent, true, 'no-answer')

    expect(accepted.calls.sent).toEqual(['takeoff 12'])
    expect(silent.calls.sent).toEqual(['takeoff 12'])
  })
})

describe('what the Take off button does: it stops when GUIDED does not come', () => {
  it('stops, sending no takeoff, when the mode change is refused or the heartbeat never says GUIDED', async () => {
    const refused = flying({ mode: 'LOITER', armingResult: { result: 'refused', messages: [] } })
    await fly(refused, false)
    const silent = flying({ mode: 'LOITER' })
    await fly(silent, false)

    expect(refused.calls.sent).toEqual(['mode 4'])
    expect(refused.calls.toast[0]?.text).toContain('refused')
    expect(silent.calls.sent).toEqual(['mode 4'])
    expect(silent.calls.toast[0]?.text).toContain('did not say it is in GUIDED')
  })

  it('stops for a vehicle that has no GUIDED mode', async () => {
    const fake = flying({ mode: 'LOITER', modes: { kind: 'other', modes: [] } })
    await fly(fake, false)

    expect(fake.calls.sent).toEqual([])
    expect(fake.calls.toast[0]?.text).toContain('no GUIDED mode')
  })
})

describe('what the Take off button tells of the takeoff', () => {
  it('tells a refusal of the vehicle with its own words, and the backend\'s refusal before anything was sent', async () => {
    const refused = flying({ armingResult: { result: 'refused', messages: ['Takeoff: too low'] } })
    await fly(refused, false)
    const backend = flying({ armingError: new BackendError('BUSY', 'x') })
    await fly(backend, false)

    expect(refused.calls.toast[0]?.text).toBe('QUADROTOR refused to take off. Takeoff: too low')
    expect(backend.calls.toast[0]?.text).toContain('Something else is under way')
    // each sent once, never again
    expect(refused.calls.sent).toEqual(['takeoff 12'])
    expect(backend.calls.sent).toEqual(['takeoff 12'])
  })

  it('does not send a takeoff again when nothing answered, and says it may have taken off', async () => {
    const fake = flying({ armingResult: { result: 'no-answer', messages: [] } })
    await fly(fake, false)

    expect(fake.calls.sent).toEqual(['takeoff 12'])
    expect(fake.calls.toast[0]?.text).toContain('The command is not sent again')
  })
})

describe('what the Take off button says of a vehicle that stays armed', () => {
  it('says the vehicle is still armed, and where to disarm it, when the takeoff was refused or unanswered', async () => {
    const refused = flying({ armingResult: { result: 'refused', messages: [] } })
    await fly(refused, false)
    const backend = flying({ armingError: new BackendError('BUSY', 'x') })
    await fly(backend, false)
    const taken = flying()
    await fly(taken, false)

    expect(refused.calls.toast.some(toast => toast.text.includes('STATE in the top bar'))).toBe(true)
    expect(backend.calls.toast.some(toast => toast.text.includes('STATE in the top bar'))).toBe(true)
    expect(taken.calls.toast.some(toast => toast.text.includes('STATE in the top bar'))).toBe(false)
  })
})
