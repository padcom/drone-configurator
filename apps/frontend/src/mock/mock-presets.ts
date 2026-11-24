// The mock backend's frame presets (#41): `presets.list` and `presets.fetch` as the backend answers them, over presets MADE UP
// here (ArduPilot's own are GPL and are never part of the application). The simulator reports no released version, so the list
// is master's, as the real backend says for it. A test can make the list unavailable or GitHub refuse for the number of requests.
import type { Envelope } from '@pico-desktop/protocol'
import type { PresetAsk, PresetsList } from '@/generated/app'

/** How the mock's presets answer. */
export interface MockPresetsOptions {
  /** An error code `presets.list` fails with (`RATE_LIMITED`, `UNAVAILABLE`), or none. */
  listFails?: string
  /** For `RATE_LIMITED`: when GitHub may be asked again (seconds since 1970, as the backend says it), or ''. */
  retryAt?: string
}

/** The presets the mock lists: made up for the mock, of the parameters its vehicle has (and one it has not). */
export const MOCK_PRESETS: Record<string, string> = {
  'Mock-Quad-Long-Range.param': '# Made up for the mock\r\nBATT_CAPACITY,8000\r\nWPNAV_SPEED,1200\r\nRTL_ALT,3000\r\n',
  'Mock-Quad-Racer.param': 'BATT_CAPACITY,1300\nLOIT_SPEED,2000\nPILOT_SPEED_UP,500\nNOT_ON_VEHICLE,1\n',
  'Boats/Mock-Boat.parm': 'FENCE_ENABLE 1\nFENCE_RADIUS 80\n',
}

type Ok = (p: Envelope['p']) => void
type Fail = (code: string, message: string) => void

/** The frame presets of the mock backend. */
export class MockPresets {
  /** What `presets.fetch` was asked for, in order. */
  readonly fetched: string[] = []

  /**
   * Makes them.
   *
   * @param options how they answer
   */
  constructor(private readonly options: MockPresetsOptions = {}) {}

  /**
   * Answers `presets.list`: master's list, from this computer.
   *
   * @param ok answers
   * @param fail refuses
   */
  list(ok: Ok, fail: Fail): void {
    const code = this.options.listFails
    if (code) {
      fail(code, code === 'RATE_LIMITED' ? (this.options.retryAt ?? '') : 'GitHub cannot be reached')

      return
    }
    const list: PresetsList = {
      vehicle: 'copter',
      ref: 'master',
      pinned: false,
      fallback: 'unreleased',
      presets: Object.entries(MOCK_PRESETS).map(([path, text]) => ({ path, size: text.length })),
      fromCache: true,
      stale: false,
      fetchedAt: Date.now(),
    }
    ok(list)
  }

  /**
   * Answers `presets.fetch` with a preset's text, or NOT_FOUND for one the list has not.
   *
   * @param ask the preset
   * @param ok answers
   * @param fail refuses
   */
  fetch(ask: PresetAsk, ok: Ok, fail: Fail): void {
    this.fetched.push(ask.path)
    const text = MOCK_PRESETS[ask.path]
    if (text === undefined) {
      fail('NOT_FOUND', `no preset ${ask.path} in the list at ${ask.ref}`)

      return
    }
    ok({ ref: ask.ref, path: ask.path, text, fromCache: true })
  }
}
