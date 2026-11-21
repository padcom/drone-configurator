// The pads the backend reads (`pad.devices`, `pad.read`: Linux evdev, every axis of a radio at once, before any input) as the
// page's pad source: the list of pads and which are denied, the one that is read, and an `Environment` for the reader that gives
// the browser's gamepads or the backend's, by what the person chose (`rc.padSource`, the browser's by default; `auto` is the
// backend where it says it has a pad backend). Nothing here can send to the vehicle: `pad.*` only reads, and what a pad says
// goes through the same reader, mapping and gates as the browser's.
//
// What a read that is not fresh is: the page's own clock, at the time a sample was RECEIVED, is the freshness (a backend that
// hangs, a link that is slow or a window that is throttled makes silence, and silence is a gap: the control lets go).
import { type ComputedRef, type ShallowRef, computed, shallowRef, watch } from 'vue'
import type { RcSettings } from './useRcSettings'
import { type BackendClient, type Subscription } from '@/backend/client'
import type { PadInfo, PadList, PadSample } from '@/generated/app'
import { type PadSource, STALE_MS, padLikeOf, padOfList, sourceOf } from '@/lib/rc/padsource'
import type { Environment, PadLike } from '@/lib/rc/reader'
import { browserEnvironment } from './useGamepad'

/** What the page needs to read the backend's pads. */
export interface PadsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The settings of the RC control (the source and the pad chosen). */
  settings: RcSettings
  /** The page's clock (ms): `performance.now()` by default; a test gives its own. */
  now?: () => number
}

/** The pads, as refs. */
export interface PadsModel {
  /** What the backend said of its pads, or null until it has. */
  readonly list: ShallowRef<PadList | null>
  /** The source that is used now: what the person chose, with `auto` resolved. */
  readonly source: ComputedRef<PadSource>
  /** The pad of the list that is read (the one chosen when it is there, else the first), or null. */
  readonly selected: ComputedRef<PadInfo | null>
  /** Why the backend's read of the selected pad ended, as a code (`DISCONNECTED`, `PERMISSION_DENIED`, ...), or null. */
  readonly ended: ShallowRef<string | null>
  /**
   * Why the backend could not list the pads (the code of the refusal of `pad.devices`, or of its end), or null while it lists
   * them (or has not been asked yet): the backend may be one built before the pad service.
   */
  readonly unavailable: ShallowRef<string | null>
  /** What the reader looks at: the browser's gamepads, or the backend's, whichever is the source now. */
  readonly environment: Environment
}

/** The latest sample of the read pad, and when it came (the page's clock). */
interface Latest {
  /** The pad it is of. */
  info: PadInfo
  /** What it said. */
  sample: PadSample
  /** When the page received it. */
  at: number
}

/** The pads the backend reads. */
class Pads implements PadsModel {
  readonly list = shallowRef<PadList | null>(null)
  readonly ended = shallowRef<string | null>(null)
  readonly unavailable = shallowRef<string | null>(null)
  readonly source = computed(() => sourceOf(this.deps.settings.padSource.value, this.list.value))
  readonly selected = computed(() => padOfList(this.list.value, this.deps.settings.padDevice.value))
  readonly environment: Environment
  private readonly browser = browserEnvironment()
  private readonly now: () => number
  private latest: Latest | null = null
  private devices: Subscription | undefined
  private reading: Subscription | undefined
  /** The pad whose read is open, or null. */
  private readingId: string | undefined
  /** The pad whose read ended by itself, with why: it is not opened again until the list says the pad is gone or back. */
  private failed: { id: string, code: string } | null = null

  /**
   * Makes it.
   *
   * @param deps what it needs
   */
  constructor(private readonly deps: PadsDeps) {
    this.now = deps.now ?? (() => performance.now())
    this.environment = {
      pads: () => (this.source.value === 'backend' ? [this.padNow()] : this.browser.pads()),
      now: () => this.now(),
      visible: () => this.browser.visible(),
    }
    const asked = (): boolean => this.deps.settings.padSource.value !== 'browser'

    watch(asked, wanted => this.wanted(wanted), { immediate: true, flush: 'sync' })
    watch([() => this.selected.value?.id ?? null, this.source], () => this.follow(), { flush: 'sync' })
    deps.client.onState(state => state === 'ready' && this.restart())
  }

  /**
   * The pad that is read, with its latest sample, as the browser's `Gamepad` shows it; null when there is none or the sample is
   * too old (the backend or the link is silent).
   *
   * @returns the pad, or null
   */
  private padNow(): PadLike | null {
    const { latest } = this

    return latest !== null && this.now() - latest.at <= STALE_MS ? padLikeOf(latest.info, latest.sample) : null
  }

  /**
   * The source wants the backend (or no longer does): the list is followed, and the read of a pad with it.
   *
   * @param wanted whether the choice is anything but the browser
   */
  private wanted(wanted: boolean): void {
    if (wanted && this.devices === undefined) {
      this.watchDevices()
    } else if (!wanted) {
      this.stopAll()
    }
  }

  /** Follows the list of pads. */
  private watchDevices(): void {
    const subscription = this.deps.client.subscribe(
      'pad.devices',
      null,
      list => this.listed(list),
      ending => {
        this.devices = undefined
        this.unavailable.value = ending?.code ?? 'ENDED'
      },
    )

    this.devices = subscription
    void this.settled(subscription, code => {
      this.devices = undefined
      // (a backend built before the pad service does not know the topic: said, never taken for "no gamepad")
      this.unavailable.value = code
    })
  }

  /**
   * Waits for a subscription to be accepted, and says when it was not.
   *
   * @param subscription the subscription
   * @param refused what to do when the backend refused it (with the reason's code)
   */
  private async settled(subscription: Subscription, refused: (code: string) => void): Promise<void> {
    try {
      await subscription.ready
    } catch (error) {
      refused((error as { code?: string }).code ?? 'ERROR')
    }
  }

  /**
   * The backend said what pads there are (at once, and again whenever one is plugged or unplugged).
   *
   * @param list the list
   */
  private listed(list: PadList): void {
    this.list.value = list
    this.unavailable.value = null

    if (this.failed !== null && !list.pads.some(pad => pad.id === this.failed?.id)) {
      this.failed = null
    }
    this.follow()
  }

  /** The pad that is read follows the list and the choice: the read is opened for the selected pad, and closed when it is not. */
  private follow(): void {
    const wanted = this.padWanted()

    if (wanted?.id !== this.readingId) {
      this.switchTo(wanted)
    }
  }

  /**
   * The pad that is to be read: the selected one while the backend is the source, none otherwise.
   *
   * @returns the pad, or undefined
   */
  private padWanted(): PadInfo | undefined {
    return this.source.value === 'backend' ? this.selected.value ?? undefined : undefined
  }

  /**
   * Closes the read that is open, and opens the read of another pad unless that one failed (and is still there).
   *
   * @param wanted the pad to read, or undefined for none
   */
  private switchTo(wanted: PadInfo | undefined): void {
    this.closeRead()

    if (wanted !== undefined && this.failed?.id !== wanted.id) {
      this.openRead(wanted)
    }
  }

  /**
   * Opens the read of a pad.
   *
   * @param info the pad
   */
  private openRead(info: PadInfo): void {
    this.readingId = info.id
    this.ended.value = null
    const subscription = this.deps.client.subscribe(
      'pad.read',
      { id: info.id },
      sample => {
        this.latest = { info, sample, at: this.now() }
      },
      ending => this.readEnded(info.id, ending?.code ?? 'ENDED'),
    )

    this.reading = subscription
    void this.settled(subscription, code => this.readEnded(info.id, code))
  }

  /**
   * The backend ended the read of a pad (it was unplugged, it may not be opened, a read failed): there is no sample any more.
   *
   * @param id the pad
   * @param code why
   */
  private readEnded(id: string, code: string): void {
    if (this.readingId !== id) {
      return
    }
    this.latest = null
    this.reading = undefined
    this.readingId = undefined
    this.ended.value = code
    // (an unplug is not a failure to try again: the list says when the pad is back; any other end is kept until the pad is gone)
    this.failed = code === 'DISCONNECTED' ? null : { id, code }
  }

  /** Closes the read that is open. */
  private closeRead(): void {
    this.reading?.stop()
    this.reading = undefined
    this.readingId = undefined
    this.latest = null
  }

  /** Stops following the backend. */
  private stopAll(): void {
    this.closeRead()
    this.devices?.stop()
    this.devices = undefined
    this.failed = null
    this.ended.value = null
    this.unavailable.value = null
  }

  /** The backend came back (it restarted): what was open is gone with it, and is opened again. */
  private restart(): void {
    this.closeRead()
    this.devices?.stop()
    this.devices = undefined
    this.failed = null
    this.unavailable.value = null

    if (this.deps.settings.padSource.value !== 'browser') {
      this.watchDevices()
    }
  }
}

/**
 * Makes the pads of the backend.
 *
 * @param deps what it needs
 * @returns the model
 */
export function usePads(deps: PadsDeps): PadsModel {
  return new Pads(deps)
}
