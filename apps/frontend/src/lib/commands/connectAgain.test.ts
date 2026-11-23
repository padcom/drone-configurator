// "Connect to the last vehicle again" (#27): one key from anywhere, while the link is down and a last connection is kept.
import { describe, expect, it } from 'vitest'
import { ConnectAgain } from './app'
import { fakeContext } from '@/testing/commandContext'
import { KEYS } from '@/lib/app/keymap'

const LAST = { transport: 'tcp' as const, host: '127.0.0.1', port: 5760 }

describe('connecting to the last vehicle again', () => {
  it('may while the link is down and a last connection is kept, and connects to it', () => {
    const command = new ConnectAgain()

    for (const state of ['disconnected', 'lost'] as const) {
      const fake = fakeContext({ connection: { state }, lastConnection: LAST })

      expect(command.isEnabled(fake.ctx)).toEqual({ enabled: true })
      expect(command.execute(fake.ctx)).toEqual({ focus: 'restore' })
      expect(fake.calls.connect).toEqual([LAST])
    }
  })

  it('may not before any connection was made', () => {
    const fake = fakeContext({ connection: { state: 'disconnected' } })

    expect(new ConnectAgain().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.noLastConnection' })
    new ConnectAgain().execute(fake.ctx)
    expect(fake.calls.connect).toEqual([])
  })

  it('may not while a link is up or being made', () => {
    for (const state of ['connecting', 'connected', 'reconnecting'] as const) {
      const fake = fakeContext({ connection: { state }, lastConnection: LAST })

      expect(new ConnectAgain().isEnabled(fake.ctx)).toEqual({ enabled: false, reasonKey: 'palette.reason.linkUp' })
    }
  })
})

it('has a key of its own that works on every screen', () => {
  const key = KEYS.find(entry => entry.actionId === 'connect.last')

  expect(key).toEqual(expect.objectContaining({ code: 'KeyL', ctrl: true, scope: 'global' }))
})
