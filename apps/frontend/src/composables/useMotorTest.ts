// The motor test, as the Motors page sees it: ONE motor spins for as long as the button is held, and the vehicle is asked for it
// only through the backend's `motors.test` subscription, which IS the test. Everything that ends the page's hold ends the
// subscription, and the backend then stops the motor: `release()` (the button let go, a key up, the pointer leaving, the window
// losing the focus), the page going away (the page calls `release()` when it unmounts), the vehicle no longer known to be
// disarmed or connected, and the backend ending the test itself (`stopped`: the link lost, the vehicle refusing). While it is
// held, the page says "still held"
// (`motors.hold`)
// every 250 ms: a page that freezes stops saying it, and the backend stops the motor after a second. Nothing here is a command of
// the palette or a shortcut: a test begins only from `start()`, which the page calls from a pressed button.
import { type ComputedRef, type Ref, type ShallowRef, computed, shallowRef, watch } from 'vue'
import { type BackendClient, BackendError, type Subscription } from '@/backend/client'
import type { Connection, MotorTestState, Telemetry } from '@/generated/app'
import {
  HOLD_PING_MS,
  SETTLE_MS,
  type TestBlock,
  clampThrottle,
  testBlock,
} from '@/lib/setup/motorTest'

/** What the motor test needs from the rest of the interface. */
export interface MotorTestDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** The latest telemetry (the armed state is read from it). */
  telemetry: Readonly<Ref<Telemetry | null>>
}

/** How the last test ended. */
export interface MotorTestEnd {
  /** The motor (in the test order). */
  motor: number
  /** Why: `RELEASED` (the button was let go), or the backend's reason (`SILENT`, `LINK_LOST`, `REFUSED`, `ARMED`, `BUSY` ...). */
  why: string
}

/** The motor test as refs and actions. */
export interface MotorTestModel {
  /** The motor that is being tested (its number in the test order), or null. */
  readonly motor: ShallowRef<number | null>
  /** How the last test ended, or null (cleared when another begins). */
  readonly ended: ShallowRef<MotorTestEnd | null>
  /** Whether a test ended a moment ago: another does not start before the vehicle has settled. */
  readonly settling: ShallowRef<boolean>
  /** Why no test can start now. */
  readonly block: ComputedRef<TestBlock>
  /** Starts a test of `motor` at `throttle` percent (held to 1 to 20), when none runs and the vehicle is known to be disarmed. */
  start: (motor: number, throttle: number) => void
  /** Ends the test that runs (the button was let go); nothing when none runs. */
  release: () => void
}

/** The motor test. */
class MotorTest implements MotorTestModel {
  readonly motor = shallowRef<number | null>(null)
  readonly ended = shallowRef<MotorTestEnd | null>(null)
  readonly settling = shallowRef(false)
  readonly block: ComputedRef<TestBlock>
  private subscription: Subscription | undefined
  private pinger: ReturnType<typeof setInterval> | undefined
  private settler: ReturnType<typeof setTimeout> | undefined

  /**
   * Makes the model.
   *
   * @param deps the client, the connection and the telemetry
   */
  constructor(private readonly deps: MotorTestDeps) {
    this.block = computed(() => testBlock(
      deps.connection.value.state === 'connected',
      deps.telemetry.value,
      this.motor.value !== null || this.settling.value,
    ))
    // A vehicle that is gone, or not known to be disarmed any more, ends the test (the armed flag of the test itself does not
    // count).
    watch(this.block, block => block !== null && this.release())
  }

  start = (motor: number, throttle: number): void => {
    if (this.motor.value !== null || this.settling.value || this.block.value !== null) {
      return
    }
    this.motor.value = motor
    this.ended.value = null
    const subscription = this.deps.client.subscribe(
      'motors.test',
      { motor, throttle: clampThrottle(throttle) },
      state => this.told(state),
      ending => this.over(motor, ending?.code ?? 'ENDED'),
    )
    this.subscription = subscription
    void this.accepted(subscription, motor)
    this.pinger = setInterval(() => void this.ping(), HOLD_PING_MS)
  }

  /**
   * Waits for the backend to take the subscription. A subscription it refuses rejects here, and that is the end of the test.
   *
   * @param subscription the subscription
   * @param motor the motor that is tested
   */
  private async accepted(subscription: Subscription, motor: number): Promise<void> {
    try {
      await subscription.ready
    } catch (failure) {
      this.over(motor, failure instanceof BackendError ? failure.code : 'ERROR')
    }
  }

  /** Tells the backend that the button is still held (a test that is over is told by its end, not by this). */
  private async ping(): Promise<void> {
    try {
      await this.deps.client.call('motors.hold', null)
    } catch {
      // (a hold the backend does not take: the test is over there, or the link is gone, and the backend stops the motor itself)
    }
  }

  release = (): void => {
    if (this.motor.value !== null) {
      this.over(this.motor.value, 'RELEASED')
    }
  }

  /**
   * The backend says where the test is.
   *
   * @param state the state
   */
  private told(state: MotorTestState): void {
    if (state.state === 'stopped' && this.motor.value !== null) {
      this.over(this.motor.value, state.why ?? 'ENDED')
    }
  }

  /**
   * The test is over, whichever way: the subscription ends (the backend stops the motor when it does), and the page waits for the
   * vehicle to settle before another may begin.
   *
   * @param motor the motor that was tested
   * @param why how it ended
   */
  private over(motor: number, why: string): void {
    if (this.motor.value !== motor) {
      return
    }
    clearInterval(this.pinger)
    this.pinger = undefined
    this.subscription?.stop()
    this.subscription = undefined
    this.motor.value = null
    this.ended.value = { motor, why }
    this.settling.value = true
    clearTimeout(this.settler)
    this.settler = setTimeout(() => {
      this.settling.value = false
    }, SETTLE_MS)
  }
}

/**
 * Makes the motor test.
 *
 * @param deps the client, the connection and the telemetry
 * @returns the model
 */
export function useMotorTest(deps: MotorTestDeps): MotorTestModel {
  return new MotorTest(deps)
}
