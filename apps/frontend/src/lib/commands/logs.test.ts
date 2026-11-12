// "Open log file…": it may run unless a log is being read or imported (the backend does one read at a time), and it goes to the
// Flights view and opens the file dialog there.
import { describe, expect, it } from 'vitest'
import { OpenLogFile } from './logs'
import { fakeContext } from '@/testing/commandContext'

const command = new OpenLogFile()

describe('Open log file…', () => {
  it('may run at any time but while a log is being read or imported, and says why then', () => {
    expect(command.isEnabled(fakeContext().ctx)).toEqual({ enabled: true })
    expect(command.isEnabled(fakeContext({ logBusy: true }).ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.logBusy' })
  })

  it('goes to Flights first, then opens the file dialog (the import is shown there)', async () => {
    const fake = fakeContext()
    const outcome = await command.execute(fake.ctx)

    expect(fake.calls.navigate).toEqual(['/logs/flights'])
    expect(fake.calls.snapshot).toEqual(['openLog'])
    expect(outcome).toEqual({ focus: 'restore' })
  })

  it('is not a vehicle command: it needs no connection', () => {
    expect(command.isEnabled(fakeContext({ connection: { state: 'disconnected' } }).ctx)).toEqual({ enabled: true })
  })
})
