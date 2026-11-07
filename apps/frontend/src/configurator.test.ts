import { describe, expect, it } from 'vitest'
import { Configurator, type State, validateDraft } from './configurator'
import { type MockControl, type MockOptions, mockBackend } from './mock-backend'
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

  it('lists serial ports and connects over one', async () => {
    const { app } = rig()
    await sleep(5)
    await app.listPorts()
    expect(app.state.ports.map(p => p.path)).toEqual(['/dev/ttyACM0', '/dev/ttyAMA0'])
    await app.connect({ transport: 'serial', device: '/dev/ttyAMA0', baud: 57600 })
    expect(app.state.error).toBe('no heartbeat from serial /dev/ttyAMA0 at 57600')
    await app.connect({ transport: 'serial', device: '/dev/ttyACM0', baud: 115200 })
    expect(app.state.connection.state).toBe('connected')
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

describe('importing a snapshot', () => {
  function edited(app: Configurator, changes: Record<string, number>): string {
    const s = JSON.parse(app.snapshot()) as { params: { id: string, value: number }[] }
    s.params = s.params.map(p => ({ ...p, value: changes[p.id] ?? p.value }))

    return JSON.stringify(s)
  }

  it('picks nothing by default, and writes only the ticked changes after one confirmation', async () => {
    const { app, questions } = await connected()
    app.loadSnapshot(edited(app, { RTL_ALT: 2000, WPNAV_SPEED: 800, LOIT_SPEED: 900 }))
    expect(app.state.importReview?.changes.map(c => c.id)).toEqual(['LOIT_SPEED', 'RTL_ALT', 'WPNAV_SPEED'])
    expect(app.state.picked).toEqual([])
    await app.applyImport()
    expect(questions).toEqual([])
    app.togglePick('RTL_ALT')
    app.togglePick('WPNAV_SPEED')
    await app.applyImport()
    expect(questions).toEqual(['Write 2 parameters to the vehicle (RTL_ALT, WPNAV_SPEED)?'])
    expect(app.state.applied.map(a => `${a.id} ${a.outcome}`)).toEqual(['RTL_ALT verified', 'WPNAV_SPEED verified'])
    expect(app.state.params.find(p => p.id === 'LOIT_SPEED')!.value).toBe(1250)
    // The values before, kept as a backup.
    const backup = JSON.parse(app.state.backup!) as { params: { id: string, value: number }[] }
    expect(backup.params.find(p => p.id === 'RTL_ALT')!.value).toBe(1500)
  })

  it('stops at the first change the vehicle doesn\'t verify', async () => {
    const { app } = await connected({ silent: ['RTL_ALT'] })
    app.loadSnapshot(edited(app, { FENCE_RADIUS: 200, RTL_ALT: 2000, WPNAV_SPEED: 800 }))
    for (const id of ['FENCE_RADIUS', 'RTL_ALT', 'WPNAV_SPEED']) {
      app.togglePick(id)
    }
    await app.applyImport()
    expect(app.state.applied.map(a => `${a.id} ${a.outcome}`)).toEqual(['FENCE_RADIUS verified', 'RTL_ALT failed'])
    expect(app.state.params.find(p => p.id === 'WPNAV_SPEED')!.value).toBe(1000)
  })

  it('saves and opens snapshot files through the backend', async () => {
    const { app } = await connected()
    expect(await app.saveFile('params.json', edited(app, { RTL_ALT: 2500 }))).toBe('/mock/params.json')
    await app.openSnapshotFile()
    expect(app.state.importReview?.changes.map(c => `${c.id} → ${c.to}`)).toEqual(['RTL_ALT → 2500'])
  })

  it('won\'t tick a change that can\'t be applied, and reports a bad file', async () => {
    const { app } = await connected()
    app.loadSnapshot(edited(app, { FENCE_ENABLE: 300 }))
    app.togglePick('FENCE_ENABLE')
    expect(app.state.picked).toEqual([])
    app.loadSnapshot('nonsense')
    expect(app.state.importError).toBe('Can\'t load it: not JSON.')
  })
})

describe('parameters changed elsewhere', () => {
  it('update the list, and an untouched draft, but not a draft being edited', async () => {
    const control: MockControl = {}
    const { app } = await connected({ control })
    app.select('RTL_ALT')
    control.announce!('RTL_ALT', 2500)
    await sleep(5)
    expect(app.state.params.find(p => p.id === 'RTL_ALT')!.value).toBe(2500)
    expect(app.state.draft).toBe('2500')
    app.editDraft('3000')
    control.announce!('RTL_ALT', 2600)
    await sleep(5)
    expect(app.state.params.find(p => p.id === 'RTL_ALT')!.value).toBe(2600)
    expect(app.state.draft).toBe('3000')
  })
})

describe('a backend restart', () => {
  it('ends the vehicle session, keeps the parameters, and waits for the user to reconnect', async () => {
    const control: MockControl = {}
    const { app } = await connected({ control })
    control.restart!()
    await sleep(30)
    expect(app.state.connection.state).toBe('disconnected')
    expect(app.state.notice).toContain('the vehicle session ended')
    expect(app.state.params.length).toBe(PARAMS.length)
    await app.connect({ transport: 'simulator' })
    await sleep(20)
    expect(app.state.connection.state).toBe('connected')
    expect(app.state.notice).toBeNull()
  })

  it('reports a write pending across the restart as unconfirmed, and doesn\'t send it again', async () => {
    const control: MockControl = {}
    const { app } = await connected({ control, silent: ['RTL_ALT'] })
    app.select('RTL_ALT')
    app.editDraft('2000')
    const writing = app.write()
    await sleep(5)
    control.restart!()
    await writing
    expect(app.state.lastWrite).toMatchObject({ kind: 'failed', id: 'RTL_ALT' })
    expect(app.state.lastWrite?.kind === 'failed' && app.state.lastWrite.message).toContain('DISCONNECTED')
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

  it('checks edits against loaded metadata too, and only when it\'s there', async () => {
    const { app, questions } = await connected()
    app.select('RTL_ALT')
    app.editDraft('100')
    expect(app.state.draftError).toBeNull()
    app.loadMetadata(JSON.stringify({ format: 'drone-configurator/param-metadata', version: 1, params: { RTL_ALT: { min: 200, units: 'cm' } } }))
    app.editDraft('100')
    expect(app.state.draftError).toBe('at least 200 cm')
    await app.write()
    expect(questions).toEqual([])
    app.loadMetadata('{')
    expect(app.state.metadataError).toBe('Can\'t load the metadata: not JSON.')
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
