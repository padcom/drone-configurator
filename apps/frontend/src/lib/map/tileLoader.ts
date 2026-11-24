// The tiles of the map in the page: which ones are wanted (the ones on screen, nearest to the middle first), a few asked of the
// backend at a time, the ones that left the screen before they came cancelled, the decoded images kept (the last 200), and why
// a tile that failed did (so that the map says so once, and does not ask again and again). The backend does the rest: its
// cache, its limits on the server, and the switches of the settings. The calls and the decoding are given, so that the tests
// need neither a backend nor a browser.
import { type TilePlace, tileKey } from './geo'

/** What the page asks of the backend, and of the browser. */
export interface TileDeps<Image> {
  /** Asks for a tile: its bytes and type. Rejects with an error that has a `code`. */
  fetch: (z: number, x: number, y: number) => Promise<{ bytes: Uint8Array, contentType: string }>
  /** Stops waiting for a tile. */
  cancel: (z: number, x: number, y: number) => void
  /** Makes an image of the bytes. */
  decode: (bytes: Uint8Array, contentType: string) => Promise<Image>
  /** Lets go of an image that is not kept any more. */
  dispose?: (image: Image) => void
  /** Called when something changed that the map has to draw again for (a tile came, or failed). */
  changed: () => void
  /** The time now (ms since 1970). */
  now?: () => number
}

/** How many decoded tiles are kept. */
export const KEPT = 200

/** How many tiles are asked for at the same time. */
export const AT_ONCE = 6

/** How long after a failure that may pass a tile is asked for again (ms). */
export const RETRY_MS = 30_000

/** The failures that will not pass by themselves, or only when a setting is changed: the tile is not asked for again before. */
const STAYS = new Set(['NOT_FOUND', 'BAD_TYPE', 'TOO_BIG', 'BAD_REQUEST', 'DISABLED', 'OFFLINE_MISS'])

/** Why a tile has no image. */
export interface Failure {
  /** The code the backend gave. */
  code: string
  /** When it may be asked for again (ms since 1970); Infinity for a failure that stays. */
  retryAt: number
}

/**
 * The code of an error a call threw.
 *
 * @param error what was thrown
 * @returns its code, or `UNAVAILABLE`
 */
function codeOf(error: unknown): string {
  const { code } = error as { code?: unknown }

  return typeof code === 'string' ? code : 'UNAVAILABLE'
}

/** The tiles of one map. */
export class TileLoader<Image> {
  private readonly images = new Map<string, Image>()
  private readonly failures = new Map<string, Failure>()
  private readonly flying = new Map<string, TilePlace>()
  private wanted: TilePlace[] = []
  private generation = 0

  constructor(private readonly deps: TileDeps<Image>) {}

  /**
   * The image of a tile, if it is there. A tile that is looked at is the newest one again (it is kept longest).
   *
   * @param key the tile's key
   * @returns the image, or undefined
   */
  get(key: string): Image | undefined {
    const image = this.images.get(key)
    if (image !== undefined) {
      this.images.delete(key)
      this.images.set(key, image)
    }

    return image
  }

  /**
   * Why a tile has no image, if it failed.
   *
   * @param key the tile's key
   * @returns the failure, or undefined
   */
  failure(key: string): Failure | undefined {
    return this.failures.get(key)
  }

  /**
   * The codes of the failures of the tiles that are wanted now (the map says why it has holes).
   *
   * @returns each code once
   */
  problems(): string[] {
    const codes = this.wanted.map(place => this.failures.get(tileKey(place.z, place.x, place.y))?.code)

    return [...new Set(codes.filter((code): code is string => code !== undefined))]
  }

  /**
   * Whether some of the tiles that are wanted now are drawn (a failure is then a hole in the map, not a map without tiles).
   *
   * @returns true when at least one is
   */
  someDrawn(): boolean {
    return this.wanted.some(place => this.images.has(tileKey(place.z, place.x, place.y)))
  }

  /**
   * How many tiles are asked for and have not come.
   *
   * @returns the count
   */
  pending(): number {
    return this.flying.size
  }

  /**
   * Says which tiles are wanted now (the ones on screen, the nearest first): those that left the screen and were asked for are
   * cancelled, and the nearest of those that are missing are asked for, a few at a time.
   *
   * @param places the tiles on screen
   */
  want(places: readonly TilePlace[]): void {
    this.wanted = [...places]
    const keys = new Set(places.map(place => tileKey(place.z, place.x, place.y)))
    for (const [key, place] of this.flying) {
      if (!keys.has(key)) {
        this.flying.delete(key)
        this.deps.cancel(place.z, place.x, place.y)
      }
    }
    this.next()
  }

  /** Forgets the failures and the images (a setting changed: the switch, offline mode, the source), and asks again. */
  forgetFailures(): void {
    this.failures.clear()
    this.release()
    this.abandon()
    this.next()
    this.deps.changed()
  }

  /** Ends the work: nothing that is asked for is waited for, and the images are let go. */
  close(): void {
    this.abandon()
    this.wanted = []
    this.release()
  }

  /** Stops waiting for every tile that is on its way (what comes of them is dropped). */
  private abandon(): void {
    this.generation += 1

    for (const place of this.flying.values()) {
      this.deps.cancel(place.z, place.x, place.y)
    }
    this.flying.clear()
  }

  /** Lets go of every image. */
  private release(): void {
    this.images.forEach(image => this.deps.dispose?.(image))
    this.images.clear()
  }

  /**
   * Whether the time of a failure has passed.
   *
   * @param key the tile's key
   * @returns true when the tile has not failed, or may be asked for again
   */
  private retryable(key: string): boolean {
    const failure = this.failures.get(key)

    return failure === undefined || failure.retryAt <= this.now()
  }

  /**
   * The time now.
   *
   * @returns ms since 1970
   */
  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** Asks for the nearest missing tiles until a few are on their way. */
  private next(): void {
    for (const place of this.wanted) {
      if (this.flying.size >= AT_ONCE) {
        return
      }
      this.ask(place)
    }
  }

  /**
   * Asks for a tile, unless it is there, on its way, or failed lately.
   *
   * @param place the tile
   */
  private ask(place: TilePlace): void {
    const key = tileKey(place.z, place.x, place.y)
    if (!this.images.has(key) && !this.flying.has(key) && this.retryable(key)) {
      this.flying.set(key, place)
      void this.load(key, place)
    }
  }

  /**
   * Asks for one tile, decodes it, and keeps it.
   *
   * @param key the tile's key
   * @param place the tile
   */
  private async load(key: string, place: TilePlace): Promise<void> {
    const { generation } = this
    try {
      const { bytes, contentType } = await this.deps.fetch(place.z, place.x, place.y)
      const image = await this.deps.decode(bytes, contentType)
      this.arrived(key, image, generation)
    } catch (error) {
      this.failed(key, codeOf(error), generation)
    }
  }

  /**
   * Whether an answer is for what is still asked for: the loader's state has not been reset, and the tile is still on its way
   * (it is no longer when it left the screen). The tile is not on its way after this.
   *
   * @param key the tile's key
   * @param generation what the loader's state was when it was asked for
   * @returns true when the answer is wanted
   */
  private settle(key: string, generation: number): boolean {
    return generation === this.generation && this.flying.delete(key)
  }

  /**
   * A tile came: it is kept if it is still wanted by the map as it was asked for.
   *
   * @param key the tile's key
   * @param image its image
   * @param generation what the loader's state was when it was asked for
   */
  private arrived(key: string, image: Image, generation: number): void {
    if (!this.settle(key, generation)) {
      this.deps.dispose?.(image)

      return
    }
    this.failures.delete(key)
    this.images.set(key, image)
    this.evict()
    this.next()
    this.deps.changed()
  }

  /**
   * A tile failed.
   *
   * @param key the tile's key
   * @param code why
   * @param generation what the loader's state was when it was asked for
   */
  private failed(key: string, code: string, generation: number): void {
    if (!this.settle(key, generation) || code === 'ABORTED') {
      return
    }
    const retryAt = STAYS.has(code) ? Number.POSITIVE_INFINITY : this.now() + RETRY_MS
    this.failures.set(key, { code, retryAt })
    this.next()
    this.deps.changed()
  }

  /** Lets go of the oldest images beyond what is kept. */
  private evict(): void {
    for (const [key, image] of this.images) {
      if (this.images.size <= KEPT) {
        return
      }
      this.images.delete(key)
      this.deps.dispose?.(image)
    }
  }
}
