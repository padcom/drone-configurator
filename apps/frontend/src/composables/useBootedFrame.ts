// The frame the vehicle STARTED with. ArduPilot fixes the order of its motors when it boots (FRAME_CLASS and FRAME_TYPE both need
// a reboot), so the letters of the motor test are for that frame, not for the one the parameters say after a write that was read
// back at once. The parameters say the booted frame only while nothing was written since the boot, so the booted frame is kept,
// and is replaced only when the vehicle is KNOWN to have restarted:
//  - the app's own reboot completed (the connection said `REBOOTING` while it was gone, and the list is read again when it is
// back);
//  - or it is a vehicle that was not seen before (a first connection, or another vehicle).
// A link that blips (reconnecting, no restart), and a disconnect and a connect to the same vehicle, do NOT make the frame the
// parameters say the booted one: the vehicle may have been written and not restarted. Then the frame it was last seen to boot
// with is kept, and a test is not offered while the parameters say another (the page says it cannot tell). A restart made another
// way (the power taken off) is not seen: the Reboot of the app is what makes it known.
import { type ComputedRef, type Ref, type ShallowRef, computed, shallowRef, watch } from 'vue'
import type { Connection } from '@/generated/app'
import type { Frame } from '@/lib/setup/motorTest'

/** What the booted frame needs. */
export interface BootedFrameDeps {
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** The parameters: the frame is read from them when the list is complete. */
  parameters: {
    list: Readonly<Ref<string>>
    params: Readonly<Ref<readonly { id: string, value: number }[]>>
  }
}

/** The booted frame as refs. */
export interface BootedFrame {
  /** The frame the vehicle started with, or null when it is not known (no complete list yet in this connection). */
  readonly booted: ShallowRef<Frame | null>
  /** The frame as the parameters say now (-1 for a parameter the vehicle has not). */
  readonly now: ComputedRef<Frame>
}

/**
 * Whether the connection is the one that is down for the app's own reboot.
 *
 * @param connection the connection
 * @returns true while the vehicle is gone for a reboot the app asked for
 */
function rebooting(connection: Connection): boolean {
  return connection.state === 'reconnecting' && connection.errorCode === 'REBOOTING'
}

/**
 * Whether the booted frame is not carried over into this connection: the session ended, or it is a new one.
 *
 * @param connection the connection
 * @returns true if the booted frame is forgotten
 */
function startsOver(connection: Connection): boolean {
  return connection.state === 'disconnected' || (connection.state === 'connected' && connection.resumed !== true)
}

/**
 * Which vehicle a connection is to.
 *
 * @param connection the connection
 * @returns its system and component, or an empty text when it has none
 */
function vehicleKey(connection: Connection): string {
  const { vehicle } = connection

  return vehicle === undefined ? '' : `${vehicle.sysid}/${vehicle.compid}`
}

/** The booted frame. */
class Booted implements BootedFrame {
  readonly booted = shallowRef<Frame | null>(null)
  readonly now: ComputedRef<Frame>
  /** The frame the last vehicle was seen to boot with (kept across a disconnect), and which vehicle it was. */
  private known: { vehicle: string, frame: Frame } | null = null
  /** Whether the app's own reboot has gone through and the list that follows is the vehicle's after its restart. */
  private rebooted = false

  /**
   * Makes it, and follows the connection and the list.
   *
   * @param deps the connection and the parameters
   */
  constructor(private readonly deps: BootedFrameDeps) {
    this.now = computed(() => {
      const value = (id: string) => deps.parameters.params.value.find(param => param.id === id)?.value ?? -1

      return { class: value('FRAME_CLASS'), type: value('FRAME_TYPE') }
    })
    watch(() => deps.connection.value, next => this.followed(next))
    watch(() => deps.parameters.list.value, list => list === 'complete' && this.taken())
  }

  /**
   * The connection changed.
   *
   * @param next the connection now
   */
  private followed(next: Connection): void {
    if (next.state === 'disconnected') {
      this.rebooted = false
    } else if (rebooting(next)) {
      this.rebooted = true
    }
    if (startsOver(next)) {
      this.booted.value = null
    }
  }

  /**
   * Whether the list that is complete now is one to take the booted frame from: the vehicle is connected, and it has none yet, or
   * it has restarted (by the app's own reboot) since.
   *
   * @returns true if it is
   */
  private canTake(): boolean {
    return this.deps.connection.value.state === 'connected' && (this.booted.value === null || this.rebooted)
  }

  /**
   * The frame the vehicle started with: the one the parameters say after a restart that is known, or for a vehicle that was not
   * seen before; else the one it was last seen to start with (it may have been written since and not restarted).
   *
   * @param vehicle which vehicle
   * @returns the frame
   */
  private frameFor(vehicle: string): Frame {
    const { known } = this

    return known !== null && known.vehicle === vehicle && !this.rebooted ? known.frame : this.now.value
  }

  /** The list is complete in a connected vehicle: the booted frame is taken, when it can be. */
  private taken(): void {
    if (this.canTake()) {
      const vehicle = vehicleKey(this.deps.connection.value)
      const frame = this.frameFor(vehicle)
      this.rebooted = false
      this.known = { vehicle, frame }
      this.booted.value = frame
    }
  }
}

/**
 * Follows the frame the vehicle started with.
 *
 * @param deps the connection and the parameters
 * @returns the booted frame and the frame now
 */
export function useBootedFrame(deps: BootedFrameDeps): BootedFrame {
  return new Booted(deps)
}
