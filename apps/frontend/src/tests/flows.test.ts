// The interface's flows against the mock backend: connecting, importing a snapshot, parameters changed elsewhere, a
// backend restart, the parameter list and editing. These are the tests of the old Configurator, with the same
// expectations; `rig` gives each the actions it used, now backed by the composables.
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { validateDraft } from '@/lib/params/draft'
import { PARAMS } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import type { State } from '@/state/state'
import { type ConfiguratorHandle, createConfigurator } from '@/composables/useConfigurator'

/**
 * The state as the components see it.
 *
 * @param handle the started Configurator
 * @returns each field's value
 */
function stateOf(handle: ConfiguratorHandle): State {
  return Object.fromEntries(Object.entries(handle.fields).map(([key, field]) => [key, field.value])) as unknown as State
}

/**
 * The actions of the flows, by the names the old Configurator gave them.
 *
 * @param handle the started Configurator
 * @returns the actions and the state
 */
function actionsOf(handle: ConfiguratorHandle) {
  const { vehicle, parameters, metadata, snapshots, staged } = handle

  return {
    get state() {
      return stateOf(handle)
    },
    connect: vehicle.connect.bind(vehicle),
    disconnect: vehicle.disconnect.bind(vehicle),
    listPorts: vehicle.listPorts.bind(vehicle),
    refresh: parameters.refresh.bind(parameters),
    setFilter: parameters.setFilter.bind(parameters),
    select: parameters.select.bind(parameters),
    editDraft: parameters.editDraft.bind(parameters),
    staged,
    // The one way to write: the draft is queued, and the queue is written after its one question.
    async write() {
      staged.sync()
      await staged.writeAll()
    },
    visible: parameters.visible.bind(parameters),
    loadMetadata: metadata.load.bind(metadata),
    snapshot: snapshots.snapshot.bind(snapshots),
    saveFile: snapshots.saveFile.bind(snapshots),
    openSnapshotFile: snapshots.openFile.bind(snapshots),
    loadSnapshot: snapshots.load.bind(snapshots),
    togglePick: snapshots.toggle.bind(snapshots),
    applyImport: snapshots.apply.bind(snapshots),
  }
}

type App = ReturnType<typeof actionsOf>

/**
 * An interface on the mock backend, answering confirmations and recording the questions.
 *
 * @param options how the mock vehicle behaves
 * @param answer what the user answers to every question
 * @returns the actions, and the questions asked so far
 */
function rig(options: MockOptions = {}, answer = true) {
  const questions: string[] = []
  const handle = createConfigurator(mockBackend({ telemetryMs: 5, ...options }), (question: string) => {
    questions.push(question)

    return Promise.resolve(answer)
  })

  return { app: actionsOf(handle), questions }
}

/**
 * Like `rig`, with the simulated vehicle connected and its parameters downloaded.
 *
 * @param options how the mock vehicle behaves
 * @param answer what the user answers to every question
 * @returns the actions, and the questions asked so far
 */
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
})

describe('a connection that fails or ends', () => {
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

/**
 * A snapshot of the parameters with some values changed.
 *
 * @param app the actions
 * @param changes the new values, by parameter id
 * @returns the snapshot's text
 */
function edited(app: App, changes: Record<string, number>): string {
  const s = JSON.parse(app.snapshot()) as { params: { id: string, value: number }[] }
  s.params = s.params.map(p => ({ ...p, value: changes[p.id] ?? p.value }))

  return JSON.stringify(s)
}

describe('importing a snapshot', () => {
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
})

describe('snapshot files', () => {
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

  it('never reports a write pending across the restart as done, and doesn\'t send it again', async () => {
    const control: MockControl = {}
    const { app } = await connected({ control, silent: ['RTL_ALT'] })
    app.select('RTL_ALT')
    app.editDraft('2000')
    const writing = app.write()
    await sleep(5)
    control.restart!()
    await writing
    // Nothing was read back, so nothing is done: the change is still there to be written again on the user's word.
    expect(app.staged.results.value.some(result => result.outcome === 'verified')).toBe(false)
    expect(app.staged.writing.value).toBe(false)
    expect(app.staged.changes.value.map(change => [change.id, change.to])).toEqual([['RTL_ALT', 2000]])
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
    // Decimals are not an error: the nearest whole number is taken, and it is that number that has to be in the range.
    expect(validateDraft(int8, '1.5')).toBeNull()
    expect(validateDraft(int8, '127.4')).toBeNull()
    expect(validateDraft(int8, '127.5')).toBe('INT8 goes from -128 to 127')
    expect(validateDraft(int8, 'abc')).toBe('a number, please')
    expect(validateDraft(int8, '-5')).toBeNull()
    const real = PARAMS.find(p => p.kind === 'real')!
    expect(validateDraft(real, '12.75')).toBeNull()
  })
})

describe('editing, and the typing of a decimal comma', () => {
  it('takes a decimal comma as a point, and a comma that is not one is not a number ("1,500" is not guessed)', () => {
    const int8 = PARAMS.find(p => p.type === 'INT8')!

    expect(validateDraft(int8, '5,4')).toBeNull()
    expect(validateDraft(int8, '127,5')).toBe('INT8 goes from -128 to 127')
    expect(validateDraft(int8, '1,2,3')).toBe('a number, please')
    expect(validateDraft(int8, '1,500')).toBe('a number with a point, please: 1,500 could be a decimal or a thousands group')
    expect(validateDraft(int8, '0,500')).toContain('could be a decimal or a thousands group')
  })

  it('warns about edits outside the loaded metadata, only when it\'s there, and still lets them be written', async () => {
    const { app, questions } = await connected()
    app.select('RTL_ALT')
    app.editDraft('100')
    expect(app.state.draftWarning).toBeNull()
    const metadata = { format: 'drone-configurator/param-metadata', version: 1, params: { RTL_ALT: { min: 200, units: 'cm' } } }
    app.loadMetadata(JSON.stringify(metadata))
    app.editDraft('100')
    expect(app.state.draftError).toBeNull()
    expect(app.state.draftWarning).toBe('Outside the usual range 200–… cm')
    await app.write()
    expect(questions).toEqual(['Write 1 parameter to the vehicle?\nRTL_ALT 1500 → 100 (Outside the usual range 200–… cm)'])
    expect(app.staged.changes.value).toEqual([])
    expect(app.staged.written.value).toEqual({ count: 1 })
    app.loadMetadata('{')
    expect(app.state.metadataError).toBe('Can\'t load the metadata: not JSON.')
  })
})

describe('writing a parameter', () => {
  it('writes after confirmation, and reports the verified read-back', async () => {
    const { app, questions } = await connected()
    app.select('WPNAV_SPEED')
    app.editDraft('750')
    await app.write()
    expect(questions).toEqual(['Write 1 parameter to the vehicle?\nWPNAV_SPEED 1000 → 750'])
    // Read back: it is done, so it is no longer in the changes.
    expect([app.staged.changes.value, app.staged.results.value, app.staged.written.value]).toEqual([[], [], { count: 1 }])
    expect(app.state.params.find(p => p.id === 'WPNAV_SPEED')!.value).toBe(750)
  })

  it('writes nothing when the user cancels, and keeps the change queued', async () => {
    const { app } = await connected({}, false)
    app.select('RTL_ALT')
    app.editDraft('2000')
    await app.write()
    expect(app.staged.results.value).toEqual([])
    expect(app.staged.changes.value.map(change => [change.id, change.to])).toEqual([['RTL_ALT', 2000]])
    expect(app.state.params.find(p => p.id === 'RTL_ALT')!.value).toBe(1500)
  })

  it('queues nothing for an invalid draft, and asks nothing', async () => {
    const { app, questions } = await connected()
    app.select('FENCE_ENABLE')
    app.editDraft('300')
    await app.write()
    expect(questions).toEqual([])
    expect(app.staged.changes.value).toEqual([])
    expect(app.state.draftError).toBe('INT8 goes from -128 to 127')
  })
})

describe('what the vehicle answers to a write', () => {
  it('says so when the vehicle reports a different value', async () => {
    const { app } = await connected({ rounding: ['LOIT_SPEED'] })
    app.select('LOIT_SPEED')
    app.editDraft('1000.6')
    await app.write()
    expect(app.staged.results.value).toEqual([
      { id: 'LOIT_SPEED', outcome: 'changed', detail: 'the vehicle reports 1001, not 1000.6' },
    ])
  })

  it('reports an unconfirmed write as such, never as success', async () => {
    const { app } = await connected({ silent: ['BATT_CAPACITY'] })
    app.select('BATT_CAPACITY')
    app.editDraft('4000')
    await app.write()
    expect(app.staged.results.value.map(result => [result.id, result.outcome])).toEqual([['BATT_CAPACITY', 'failed']])
    expect(app.staged.writing.value).toBe(false)
  })
})
