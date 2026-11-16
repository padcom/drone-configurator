// Set home here as a command: when it may run (a vehicle whose state is known, with a fresh position, that stands still: armed
// or not), that
// it asks a HOLD that says what changes (where RTL goes, and the altitude of home), and what it tells of the answer.
import { afterEach, describe, expect, it } from 'vitest'
import { BackendError } from '@/backend/client'
import { setLanguage } from '@/i18n/i18n'
import { fakeContext } from '@/testing/commandContext'
import { inTheAir } from '@/testing/guided'
import { SetHomeHere, setHomeHere } from './setHomeHere'

afterEach(() => {
  setLanguage('en')
})

const command = new SetHomeHere()
const moving = (change: Partial<NonNullable<ReturnType<typeof inTheAir>['position']>>) => (
  inTheAir({ position: { ...inTheAir().position!, ...change } })
)

/**
 * A vehicle that stands still in the air, as a test changes it.
 *
 * @param change what is different
 * @returns the fake context
 */
function ready(change: Parameters<typeof fakeContext>[0] = {}): ReturnType<typeof fakeContext> {
  return fakeContext({ armed: true, mode: 'GUIDED', telemetry: inTheAir(), ...change })
}

describe('when a set of home here may run', () => {
  it('may for a vehicle that stands still, armed or not', () => {
    expect(command.isEnabled(ready().ctx)).toEqual({ enabled: true })
    expect(command.isEnabled(ready({ armed: false }).ctx)).toEqual({ enabled: true })
  })

  it.each([
    ['without a vehicle', { connection: { state: 'disconnected' as const } }, 'palette.reason.notConnected'],
    ['when the state is not known', { armed: undefined }, 'palette.reason.stateUnknown'],
    ['while parameters are written', { busy: 'writing' as const }, 'palette.reason.writing'],
    ['without a position', { telemetry: inTheAir({ position: undefined }) }, 'guided.reason.position'],
    ['while the vehicle moves over the ground', { telemetry: moving({ vx: 2 }) }, 'guided.reason.still'],
    ['while the vehicle climbs', { telemetry: moving({ vz: -1 }) }, 'guided.reason.still'],
  ])('may not %s, and says why', (_name, facts, reasonKey) => {
    expect(command.isEnabled(ready(facts).ctx)).toEqual({ enabled: false, reasonKey })
  })

  it('is dangerous (never boosted by use)', () => {
    expect(command.dangerous).toBe(true)
  })
})

describe('the question', () => {
  it('is a HOLD that names the vehicle and says that Return home now flies there, and that home\'s altitude moves', () => {
    const asked = command.confirmation(ready().ctx)

    expect(asked.level).toBe('hold')
    expect(asked.dismissal).toBe('cross')
    expect(asked.vehicle).toContain('QUADROTOR')
    expect(asked.what).toContain('Return home (RTL) flies to this point from now on')
    expect(asked.what).toContain('altitude of home moves with it')
    expect(asked.what).toContain(`${inTheAir().position!.lat.toFixed(5)}, ${inTheAir().position!.lon.toFixed(5)}`)
  })
})

describe('what it does', () => {
  it('sends it once, and says that Return home now flies there', async () => {
    const fake = ready()

    expect(await setHomeHere(fake.ctx)).toBe(true)
    expect(fake.calls.sent).toEqual(['home here'])
    expect(fake.calls.toast.some(toast => toast.text === 'Home is set here: Return home now flies to this point.')).toBe(true)
  })

  it('tells what the backend refused, in words, and says nothing of Return home', async () => {
    const fake = ready({ armingError: new BackendError('NOT_HOVERING', 'x') })

    expect(await setHomeHere(fake.ctx)).toBe(false)
    expect(fake.calls.toast.at(-1)?.text).toBe('The vehicle must stand still to set home: it is moving, climbing or sinking.')
    expect(fake.calls.toast.some(toast => toast.text.includes('Return home now'))).toBe(false)
  })

  it('tells a refusal of the vehicle', async () => {
    const fake = ready({ armingResult: { result: 'refused', messages: [] } })

    expect(await setHomeHere(fake.ctx)).toBe(false)
    expect(fake.calls.toast.at(-1)?.text).toBe('QUADROTOR refused to set home here.')
  })

  it('does not send it again when nothing answered, and says that home may have moved', async () => {
    const fake = ready({ armingResult: { result: 'no-answer', messages: [] } })

    expect(await setHomeHere(fake.ctx)).toBe(false)
    expect(fake.calls.sent).toEqual(['home here'])
    expect(fake.calls.toast.at(-1)?.text).toContain('Home may have moved')
  })
})
