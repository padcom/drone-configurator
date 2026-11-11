// The commands of the top bar and the Parameters toolbar: what they say about whether they may run (and why not), and what they
// ask of the context when they do.
import { describe, expect, it } from 'vitest'
import { fakeContext } from '@/testing/commandContext'
import { ConnectToVehicle, DisconnectFromVehicle, ShowPalette } from './app'
import { DownloadParameters, LoadSnapshot, SaveSnapshot } from './snapshots'

describe('Disconnect', () => {
  it.each([['connected', true], ['reconnecting', true], ['connecting', false], ['disconnected', false]] as const)(
    'while %s it may run: %s (the tries to bring a lost link back are ended by it, so it is offered during them)',
    (state, may) => {
      const { ctx } = fakeContext({ connection: { state } })

      expect(new DisconnectFromVehicle().isEnabled(ctx)).toEqual(
        may ? { enabled: true } : { enabled: false, reasonKey: 'palette.reason.notConnected' },
      )
    },
  )

  it('ends the session', () => {
    const fake = fakeContext()

    new DisconnectFromVehicle().execute(fake.ctx)

    expect(fake.calls.disconnect).toHaveLength(1)
  })
})

describe('the dialogs', () => {
  it('opens the connect dialog, always', () => {
    const fake = fakeContext({ connection: { state: 'disconnected' } })
    const connect = new ConnectToVehicle()

    expect(connect.isEnabled()).toEqual({ enabled: true })
    connect.execute(fake.ctx)

    expect(fake.calls.dialogs).toEqual(['connect'])
  })

  it('opens the palette, everywhere, and has the key the keymap gives it', () => {
    const fake = fakeContext()
    const show = new ShowPalette()

    expect(show.isEnabled()).toEqual({ enabled: true })
    show.execute(fake.ctx)

    expect(fake.calls.dialogs).toEqual(['palette'])
    expect(show.id).toBe('palette.open')
    expect(show.shortcut).toMatch(/^(?:Ctrl|⌘) P$/u)
  })
})

describe('Download', () => {
  it('needs a connected vehicle', () => {
    const { ctx } = fakeContext({ connection: { state: 'disconnected' } })

    expect(new DownloadParameters().isEnabled(ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.notConnected' })
  })

  it('waits for a download that is under way, and for a write that holds the parameters', () => {
    const downloading = fakeContext({ busy: 'downloading' })
    const writing = fakeContext({ paramsBusy: true })

    const download = new DownloadParameters()

    expect(download.isEnabled(downloading.ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.downloading' })
    expect(download.isEnabled(writing.ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.busy' })
  })

  it('downloads the list when it may', () => {
    const fake = fakeContext()
    const download = new DownloadParameters()

    expect(download.isEnabled(fake.ctx)).toEqual({ enabled: true })
    download.execute(fake.ctx)

    expect(fake.calls.download).toHaveLength(1)
  })
})

describe('the snapshots', () => {
  it('saves only when there are parameters', () => {
    const none = fakeContext({ paramCount: 0 })
    const some = fakeContext({ paramCount: 3 })

    expect(new SaveSnapshot().isEnabled(none.ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.noParameters' })
    expect(new SaveSnapshot().isEnabled(some.ctx)).toEqual({ enabled: true })
    new SaveSnapshot().execute(some.ctx)

    expect(some.calls.snapshot).toEqual(['save'])
  })

  it('opens a snapshot file at any time', () => {
    const fake = fakeContext({ connection: { state: 'disconnected' }, paramCount: 0 })
    const load = new LoadSnapshot()

    expect(load.isEnabled()).toEqual({ enabled: true })
    load.execute(fake.ctx)

    expect(fake.calls.snapshot).toEqual(['load'])
  })
})
