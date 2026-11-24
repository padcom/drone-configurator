// What the mock backend says of the forwarding (`forward.status`): the endpoints the settings hold (the same entry the real
// backend reads, apps/backend/forward.pi), each off when it is turned off, idle while no vehicle is connected, and up with no
// traffic while one is (the mock forwards nothing: it has no sockets).
import type { ForwardStatus, Settings } from '@/generated/app'
import { FORWARD_KEY, parseEndpoints } from '@/lib/forward/endpoints'

/**
 * The status the settings and the connection come to.
 *
 * @param settings the settings the mock holds
 * @param connected whether a vehicle is connected
 * @returns the status
 */
export function forwardStatusOf(settings: Settings, connected: boolean): ForwardStatus {
  const text = settings.ui.find(entry => entry.key === FORWARD_KEY)?.value

  return {
    endpoints: parseEndpoints(text).map(e => ({
      ...e,
      state: e.on ? (connected ? 'up' : 'idle') : 'off',
      sent: 0,
      dropped: 0,
      received: 0,
    })),
  }
}
