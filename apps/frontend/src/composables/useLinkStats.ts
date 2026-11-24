// The quality of the link to the vehicle (`link.stats`, #29): the backend sends it once a second while a vehicle is connected. It
// talks to the backend through the client (docs/frontend-state.md). What is shown is only what the backend measured: nothing
// without a connected vehicle.
import { type ShallowRef, shallowRef, watch } from 'vue'
import type { BackendClient } from '@/backend/client'
import type { Connection, LinkStats } from '@/generated/app'

/** What the link's quality needs from the rest of the interface. */
export interface LinkStatsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The connection's state: the stats are only those of a connected vehicle. */
  connection: ShallowRef<Connection>
}

/** The link's quality, as a ref and an action. */
export interface LinkStatsModel {
  /** The last stats the backend sent; null without a connected vehicle. */
  readonly stats: ShallowRef<LinkStats | null>
  /** Starts listening to the backend. */
  watch: () => Promise<void>
}

/**
 * The link's quality.
 *
 * @param deps the client and the connection
 * @returns the stats and the way to start them
 */
export function useLinkStats(deps: LinkStatsDeps): LinkStatsModel {
  const stats = shallowRef<LinkStats | null>(null)
  // The stats of a link that is no longer up are not what the link is now.
  watch(deps.connection, connection => {
    if (connection.state !== 'connected') {
      stats.value = null
    }
  })

  return {
    stats,
    async watch() {
      try {
        await deps.client.subscribe('link.stats', null, next => {
          stats.value = deps.connection.value.state === 'connected' ? next : null
        }).ready
      } catch {
        // A backend without it (an older one): the LINK cell stays a dash, which is what is known.
      }
    },
  }
}
