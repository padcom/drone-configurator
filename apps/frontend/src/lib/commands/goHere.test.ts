// Go here as a command: when it may run (a connected, armed vehicle in the air, with the complete parameter list, a place
// picked within
// the limits), how it is confirmed (as Settings say: not at all, plain or a hold), and the flow after the confirmation: GUIDED
// if the
// vehicle is not in it, the speed, then ONE reposition; it stops at the first step that does not go, and tells in words.
import { afterEach, describe, expect, it } from 'vitest'
import { BackendError } from '@/backend/client'
import { setLanguage } from '@/i18n/i18n'
import { GUIDED_DEFAULTS } from '@/lib/fly/guided'
import { fakeContext } from '@/testing/commandContext'
import { HOME, NORTH, inTheAir } from '@/testing/guided'
import { GoHere } from './goHere'
import { goHere } from './goHereFlow'

afterEach(() => {
  setLanguage('en')
})

const command = new GoHere()
const onTheGround = inTheAir({ position: { ...inTheAir().position!, relativeAltitude: 0.4 } })
const WAITS = { pollMs: 5, modeMs: 500, armMs: 300 }
const FAR = { lat: HOME.lat + 0.01, lon: HOME.lon }

/**
 * A vehicle that is armed in GUIDED, in the air, with a place picked, as a test changes it.
 *
 * @param change what is different
 * @returns the fake context
 */
function ready(change: Parameters<typeof fakeContext>[0] = {}): ReturnType<typeof fakeContext> {
  return fakeContext({ armed: true, mode: 'GUIDED', telemetry: inTheAir(), target: NORTH, ...change })
}

describe('when Go here may run', () => {
  it('may for an armed vehicle in the air with a place picked and the whole parameter list', () => {
    expect(command.isEnabled(ready().ctx)).toEqual({ enabled: true })
  })

  it.each([
    ['without a vehicle', { connection: { state: 'disconnected' as const } }, 'palette.reason.notConnected'],
    ['when the state is not known', { armed: undefined }, 'palette.reason.stateUnknown'],
    ['when the vehicle is not armed', { armed: false }, 'palette.reason.notArmed'],
    ['while parameters are written', { busy: 'writing' as const }, 'palette.reason.writing'],
    ['without the complete parameter list', { listComplete: false }, 'guided.reason.params'],
    ['without a position', { telemetry: inTheAir({ position: undefined }) }, 'guided.reason.position'],
    ['on the ground', { telemetry: onTheGround }, 'guided.reason.air'],
    ['without home', { telemetry: inTheAir({ home: undefined }) }, 'guided.reason.home'],
    ['without a place', { target: null }, 'guided.reason.target'],
    ['for a place farther from home than the limit', { target: FAR }, 'guided.reason.far'],
  ])('may not %s, and says why', (_name, facts, reasonKey) => {
    expect(command.isEnabled(ready(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })

  it('is dangerous (never boosted by use)', () => {
    expect(command.dangerous).toBe(true)
  })
})

describe('how it is confirmed', () => {
  it('asks nothing when Settings say so', () => {
    expect(command.confirmation(ready({ guidedPrefs: { ...GUIDED_DEFAULTS, confirmation: 'none' } }).ctx)).toBeNull()
  })

  it('asks a plain confirmation by default that says how far, how high and how fast, and names the vehicle', () => {
    const asked = command.confirmation(ready().ctx)!

    expect(asked.level).toBe('plain')
    expect(asked.vehicle).toContain('QUADROTOR')
    expect(asked.what).toContain('56 m from it and 56 m from home')
    expect(asked.what).toContain('20 m above home and 5 m/s')
    // (the vehicle is in GUIDED: nothing is said of the mode)
    expect(asked.what).not.toContain('GUIDED first')
  })

  it('asks a hold when Settings say so, and says that the mode changes first when it is not GUIDED', () => {
    const asked = command.confirmation(ready({ guidedPrefs: { ...GUIDED_DEFAULTS, confirmation: 'hold' }, mode: 'LOITER' }).ctx)!

    expect(asked.level).toBe('hold')
    expect(asked.what).toContain('changes to GUIDED first')
  })
})

describe('what it sends', () => {
  it('sets the speed and sends ONE reposition to the place picked, at the altitude it has, and drops the place', async () => {
    const fake = ready()

    expect(await goHere(fake.ctx, WAITS)).toBe(true)
    expect(fake.calls.sent).toEqual(['speed 5', 'reposition 52.2302,21.0122 20 block'])
    expect(fake.calls.cleared).toEqual(['cleared'])
    expect(fake.calls.toast.at(-1)?.text).toBe('QUADROTOR accepted: it flies to the place, 20 m above home.')
  })
})

describe('what it does about the mode and the failsafe', () => {
  it('puts the vehicle in GUIDED first, and goes on once the heartbeat says so', async () => {
    const fake = ready({ mode: 'LOITER' })
    const set = fake.ctx.vehicle.setMode.bind(fake.ctx.vehicle)
    fake.ctx.vehicle.setMode = async mode => {
      const answer = await set(mode)
      setTimeout(() => {
        fake.facts.mode = 'GUIDED'
      }, 10)

      return answer
    }

    expect(await goHere(fake.ctx, WAITS)).toBe(true)
    // (GUIDED is mode 4 of a Copter)
    expect(fake.calls.sent).toEqual(['mode 4', 'speed 5', 'reposition 52.2302,21.0122 20 block'])
  })
})

describe('what it sends of the settings', () => {
  it('sends what Settings say: the failsafe policy and the speed', async () => {
    const fake = ready({ guidedPrefs: { ...GUIDED_DEFAULTS, failsafe: 'warn', speed: 8 } })
    await goHere(fake.ctx, WAITS)

    expect(fake.calls.sent).toEqual(['speed 8', 'reposition 52.2302,21.0122 20 warn'])
  })

  it('says the failsafe warning the vehicle came back with, when the user chose to be warned', async () => {
    const warning = 'FS_GCS_ENABLE is 0: if the link drops, it keeps its last command'
    const fake = ready({ armingResult: { result: 'accepted', messages: [warning] } })
    await goHere(fake.ctx, WAITS)

    expect(fake.calls.toast.some(toast => toast.text.includes('FS_GCS_ENABLE is 0'))).toBe(true)
  })
})

describe('when nothing is picked', () => {
  it('sends nothing when no place is picked', async () => {
    const fake = ready({ target: null })

    expect(await goHere(fake.ctx, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual([])
  })
})

describe('when the speed does not go', () => {
  it('stops after a speed the vehicle refuses: no reposition, the place kept', async () => {
    const fake = ready({ armingResult: { result: 'refused', messages: [] } })

    expect(await goHere(fake.ctx, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['speed 5'])
    expect(fake.calls.cleared).toEqual([])
  })
})

describe('when the backend refuses', () => {
  it('tells what the backend refused before it sent anything, in words, and keeps the place', async () => {
    const fake = ready({ armingError: new BackendError('OUT_OF_LIMITS', 'x') })

    expect(await goHere(fake.ctx, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['speed 5'])
    expect(fake.calls.toast.at(-1)?.text).toBe("That is beyond the limits in Settings or the vehicle's own fence.")
    expect(fake.calls.cleared).toEqual([])
  })

  it('tells that the failsafe blocks, with the way out', async () => {
    const fake = ready({ armingError: new BackendError('GCS_FAILSAFE_OFF', 'x') })
    await goHere(fake.ctx, WAITS)

    expect(fake.calls.toast.at(-1)?.text).toContain('FS_GCS_ENABLE')
  })

  it('stops at a speed that nothing answered, and sends no reposition', async () => {
    const fake = ready({ armingResult: { result: 'no-answer', messages: [] } })

    expect(await goHere(fake.ctx, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['speed 5'])
    expect(fake.calls.toast.at(-1)?.text).toContain('No answer')
  })
})

describe('when the reposition does not go', () => {
  it('does not send a reposition again that nothing answered, says it may be flying there, and keeps the place', async () => {
    const fake = ready()
    fake.ctx.vehicle.reposition = ask => {
      fake.calls.sent.push(`reposition ${ask.latitude},${ask.longitude}`)

      return Promise.resolve({ result: 'no-answer', messages: [] })
    }

    expect(await goHere(fake.ctx, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['speed 5', 'reposition 52.2302,21.0122'])
    expect(fake.calls.toast.at(-1)?.text).toContain('is not sent again')
    expect(fake.calls.cleared).toEqual([])
  })

  it('stops when the vehicle never says it is in GUIDED', async () => {
    const fake = ready({ mode: 'LOITER' })

    expect(await goHere(fake.ctx, WAITS)).toBe(false)
    expect(fake.calls.sent).toEqual(['mode 4'])
  })
})
