import { describe, expect, it } from 'vitest'
import { Configurator, type State, validateDraft } from './configurator'
import { type MockOptions, mockBackend } from './mock-backend'
import { PARAMS } from './fixtures'

const sleep = (ms: number) => new Promise(resolve => {
  setTimeout(resolve, ms)
})

/** A configurator on the mock backend, recording renders and answering confirmations. */
function rig(options: MockOptions = {}, answer = true) {
  const questions: string[] = []
  const renders: State[] = []
  const app = new Configurator(mockBackend({ telemetryMs: 5, ...options }), {
    render: s => renders.push(s),
    confirm: async question => {
      questions.push(question)

      return answer
    },
  })

  return { app, questions, renders }
}

async function connected(options: MockOptions = {}, answer = true) {
  const r = rig(options, answer)
  await r.app.connect({ transport: 'simulator' })
  await sleep(20)

  return r
}

describe('connecting', () => {
  it('connects to the simulator, shows the vehicle and downloads its parameters', async () => {
    const { app } = await connected()
    expect(app.state.connection.state).toBe('connected')
    expect(app.state.connection.vehicle).toMatchObject({ sysid: 1, type: 'QUADROTOR' })
    expect(app.state.list).toBe('complete')
    expect(app.state.params.map(p => p.id)).toEqual(PARAMS.map(p => p.id))
  })

  it('reports why a connection failed', async () => {
    const { app } = rig()
    await app.connect({ transport: 'udp', port: 14550 })
    expect(app.state.connection.state).toBe('disconnected')
    expect(app.state.error).toBe('no heartbeat from udp 127.0.0.1:14550')
  })

  it('streams telemetry while connected, and stops showing it after disconnecting', async () => {
    const { app } = await connected()
    expect(app.state.telemetry?.mode).toBeDefined()
    await app.disconnect()
    expect(app.state.connection.state).toBe('disconnected')
    expect(app.state.telemetry).toBeNull()
    // The parameters stay visible, but the editor is closed (the view hides it).
    expect(app.state.params.length).toBe(PARAMS.length)
  })
})

describe('the parameter list', () => {
  it('filters by name, case-insensitively', async () => {
    const { app } = await connected()
    app.setFilter('batt')
    expect(app.visible().map(p => p.id)).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])
    app.setFilter('')
    expect(app.visible().length).toBe(PARAMS.length)
  })

  it('needs a connection to download', async () => {
    const { app } = rig()
    await sleep(5)
    await app.refresh()
    expect(app.state.list).toBe('failed')
    expect(app.state.error).toBe('NOT_CONNECTED: no vehicle is connected')
  })
})

describe('editing', () => {
  it('validates the draft against the parameter type', () => {
    const int8 = PARAMS.find(p => p.type === 'INT8')!
    expect(validateDraft(int8, '200')).toBe('INT8 goes from -128 to 127')
    expect(validateDraft(int8, '1.5')).toBe(`${int8.id} is an integer (INT8)`)
    expect(validateDraft(int8, 'abc')).toBe('a number, please')
    expect(validateDraft(int8, '-5')).toBeNull()
    const real = PARAMS.find(p => p.kind === 'real')!
    expect(validateDraft(real, '12.75')).toBeNull()
  })

  it('writes after confirmation, and reports the verified read-back', async () => {
    const { app, questions } = await connected()
    app.select('WPNAV_SPEED')
    app.editDraft('750')
    await app.write()
    expect(questions).toEqual(['Set WPNAV_SPEED from 1000 to 750?'])
    expect(app.state.lastWrite).toEqual({ kind: 'verified', id: 'WPNAV_SPEED', value: 750 })
    expect(app.state.params.find(p => p.id === 'WPNAV_SPEED')!.value).toBe(750)
  })

  it('writes nothing when the user cancels', async () => {
    const { app } = await connected({}, false)
    app.select('RTL_ALT')
    app.editDraft('2000')
    await app.write()
    expect(app.state.lastWrite).toBeNull()
    expect(app.state.params.find(p => p.id === 'RTL_ALT')!.value).toBe(1500)
  })

  it('refuses an invalid draft without asking', async () => {
    const { app, questions } = await connected()
    app.select('FENCE_ENABLE')
    app.editDraft('300')
    await app.write()
    expect(questions).toEqual([])
    expect(app.state.draftError).toBe('INT8 goes from -128 to 127')
  })

  it('says so when the vehicle reports a different value', async () => {
    const { app } = await connected({ rounding: ['LOIT_SPEED'] })
    app.select('LOIT_SPEED')
    app.editDraft('1000.6')
    await app.write()
    expect(app.state.lastWrite).toEqual({ kind: 'changed', id: 'LOIT_SPEED', asked: 1000.6, reported: 1001 })
  })

  it('reports an unconfirmed write as such, never as success', async () => {
    const { app } = await connected({ silent: ['BATT_CAPACITY'] })
    app.select('BATT_CAPACITY')
    app.editDraft('4000')
    await app.write()
    expect(app.state.lastWrite?.kind).toBe('failed')
    expect(app.state.writing).toBe(false)
  })
})
