// What the Setup pages ask of the vehicle that is not a parameter: what the board says of itself (`vehicle.info`) and the flight
// modes of its kind (`vehicle.modes`). Each is read when a page that needs it is shown, once for the vehicle that is connected:
// an answer that comes for a vehicle that is gone is dropped. A failure is said in words and leaves the page without the answer.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import type { VehicleDetails, VehicleModes } from '@/generated/app'

/** What the setup needs from the rest of the interface. */
export interface SetupDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** The details the Setup pages ask the vehicle for, as refs and actions. */
export interface SetupModel {
  /** What the board says of itself and its sensors, or null before it was read. */
  readonly details: ShallowRef<VehicleDetails | null>
  /** The modes of the vehicle's kind, or null before they were read. */
  readonly modes: ShallowRef<VehicleModes | null>
  /** Why the last read failed, in words, or null. */
  readonly error: ShallowRef<string | null>
  /** Whether the details are being read. */
  readonly loadingDetails: ShallowRef<boolean>
  /** Reads the board's details (again: the sensors change). */
  loadDetails: () => Promise<void>
  /** Reads the modes, once for the vehicle. */
  loadModes: () => Promise<void>
  /** The vehicle is gone, or another one is there: forgets what was read. */
  reset: () => void
}

/** The vehicle's details. */
class Setup implements SetupModel {
  readonly details = shallowRef<VehicleDetails | null>(null)
  readonly modes = shallowRef<VehicleModes | null>(null)
  readonly error = shallowRef<string | null>(null)
  readonly loadingDetails = shallowRef(false)
  /** Goes up with every reset: an answer for an earlier vehicle is dropped. */
  private epoch = 0
  private loadingModes = false

  /**
   * Makes the model.
   *
   * @param deps the link to the backend
   */
  constructor(private readonly deps: SetupDeps) {}

  /**
   * Makes a call for this vehicle: what it answers is used only if the vehicle is still the one it was asked about, and a failure
   * is said.
   *
   * @param call makes the call
   * @param apply uses the answer
   */
  private async read<T>(call: () => Promise<T>, apply: (answer: T) => void): Promise<void> {
    const { epoch } = this
    try {
      const answer = await call()
      if (epoch === this.epoch) {
        apply(answer)
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.error.value = describeError(error)
      }
    }
  }

  async loadDetails(): Promise<void> {
    if (this.loadingDetails.value) {
      return
    }
    const { epoch } = this
    this.loadingDetails.value = true
    await this.read(() => this.deps.client.call('vehicle.info', null), details => {
      this.details.value = details
      this.error.value = null
    })

    if (epoch === this.epoch) {
      this.loadingDetails.value = false
    }
  }

  async loadModes(): Promise<void> {
    if (this.modes.value !== null || this.loadingModes) {
      return
    }
    const { epoch } = this
    this.loadingModes = true
    await this.read(() => this.deps.client.call('vehicle.modes', null), modes => {
      this.modes.value = modes
    })

    if (epoch === this.epoch) {
      this.loadingModes = false
    }
  }

  reset(): void {
    this.epoch += 1
    this.details.value = null
    this.modes.value = null
    this.error.value = null
    this.loadingDetails.value = false
    this.loadingModes = false
  }
}

/**
 * Makes the setup's details.
 *
 * @param deps the link to the backend
 * @returns the model
 */
export function useSetup(deps: SetupDeps): SetupModel {
  return new Setup(deps)
}
