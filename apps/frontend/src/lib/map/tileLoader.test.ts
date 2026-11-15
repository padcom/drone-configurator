// The tiles in the page against a backend that is a table of promises the test settles: a few at a time, the nearest first, those
// that left the screen cancelled, an image kept for the tiles that are looked at, and why a tile failed, told once and not asked
// for again at once.
import { describe, expect, it, vi } from 'vitest'
import { type TilePlace, tileKey } from './geo'
import { AT_ONCE, KEPT, RETRY_MS, TileLoader } from './tileLoader'

/** A tile that is asked for and has not been answered. */
interface Asked {
  key: string
  resolve: () => void
  reject: (code: string) => void
}

/**
 * A loader over a backend the test answers by hand.
 *
 * @returns the loader, what was asked, cancelled, decoded and disposed, the changes, and the clock
 */
function rig() {
  const asked: Asked[] = []
  const cancelled: string[] = []
  const disposed: string[] = []
  const changes = { count: 0 }
  const clock = { now: 1_000_000 }
  const loader = new TileLoader<string>({
    fetch: (z, x, y) => new Promise((resolve, reject) => {
      asked.push({
        key: tileKey(z, x, y),
        resolve: () => resolve({ bytes: new Uint8Array([1]), contentType: 'image/png' }),
        reject: code => reject(Object.assign(new Error(code), { code })),
      })
    }),
    cancel: (z, x, y) => void cancelled.push(tileKey(z, x, y)),
    decode: () => Promise.resolve('image'),
    dispose: image => void disposed.push(image),
    changed: () => void (changes.count += 1),
    now: () => clock.now,
  })

  return { loader, asked, cancelled, disposed, changes, clock }
}

/**
 * Tiles in a row at a zoom, the first the nearest.
 *
 * @param count how many
 * @param z the zoom
 * @returns the tiles
 */
function row(count: number, z = 10): TilePlace[] {
  return Array.from({ length: count }, (_unused, x) => ({ z, x, y: 0, left: x * 256, top: 0 }))
}

/** Lets what the promises started finish. */
async function settle(): Promise<void> {
  await vi.waitFor(() => expect(true).toBe(true))
  await Promise.resolve()
  await new Promise<void>(resolve => {
    setTimeout(resolve, 0)
  })
}

describe('asking', () => {
  it('asks for the nearest tiles first, a few at a time, and for the next one as one comes', async () => {
    const { loader, asked } = rig()
    loader.want(row(10))

    expect(asked.map(one => one.key)).toEqual(row(AT_ONCE).map(place => tileKey(place.z, place.x, place.y)))
    asked[0]?.resolve()
    await settle()

    expect(asked).toHaveLength(AT_ONCE + 1)
    expect(asked[AT_ONCE]?.key).toBe('10/6/0')
    expect(loader.pending()).toBe(AT_ONCE)
  })

  it('does not ask again for a tile it has, or one that is on its way', async () => {
    const { loader, asked } = rig()
    loader.want(row(2))
    asked[0]?.resolve()
    await settle()
    loader.want(row(2))

    expect(asked).toHaveLength(2)
    expect(loader.get('10/0/0')).toBe('image')
  })
})

describe('leaving', () => {
  it('cancels the tiles that left the screen, and drops what comes of them', async () => {
    const { loader, asked, cancelled, disposed } = rig()
    loader.want(row(3))
    loader.want(row(3).slice(2))

    expect(cancelled).toEqual(['10/0/0', '10/1/0'])
    asked[0]?.resolve()
    await settle()

    expect(loader.get('10/0/0')).toBeUndefined()
    expect(disposed).toEqual(['image'])
  })
})

describe('keeping', () => {
  it('keeps the last tiles it looked at, and lets go of the oldest beyond the number it keeps', async () => {
    const { loader, asked, disposed } = rig()
    const many = row(KEPT + 5, 12)
    for (let i = 0; i < many.length; i += AT_ONCE) {
      loader.want(many.slice(i, i + AT_ONCE))
      asked.splice(0).forEach(one => one.resolve())
      // eslint-disable-next-line no-await-in-loop -- one batch after the other, as the screen moves
      await settle()
    }

    expect(disposed.length).toBeGreaterThanOrEqual(5)
    expect(loader.get('12/0/0')).toBeUndefined()
    expect(loader.get(`12/${KEPT + 4}/0`)).toBe('image')
  })
})

describe('failing', () => {
  it('says why a tile failed, each reason once, and asks again after a while for what may pass', async () => {
    const { loader, asked, clock, changes } = rig()
    loader.want(row(2))
    asked[0]?.reject('UNAVAILABLE')
    asked[1]?.reject('RATE_LIMITED')
    await settle()

    expect(loader.problems().sort()).toEqual(['RATE_LIMITED', 'UNAVAILABLE'])
    expect(changes.count).toBeGreaterThan(0)
    loader.want(row(2))
    expect(asked).toHaveLength(2)
    clock.now += RETRY_MS + 1
    loader.want(row(2))

    expect(asked).toHaveLength(4)
  })
})

describe('failing for good', () => {
  it('does not ask again for a tile the server lacks, or one that is switched off, until the settings change', async () => {
    const { loader, asked, clock } = rig()
    loader.want(row(3))
    asked[0]?.reject('NOT_FOUND')
    asked[1]?.reject('DISABLED')
    asked[2]?.reject('OFFLINE_MISS')
    await settle()
    clock.now += RETRY_MS * 100
    loader.want(row(3))

    expect(asked).toHaveLength(3)
    loader.forgetFailures()

    expect(asked).toHaveLength(6)
    expect(loader.problems()).toEqual([])
  })

  it('says nothing of a tile it stopped waiting for', async () => {
    const { loader, asked } = rig()
    loader.want(row(1))
    loader.want([])
    asked[0]?.reject('ABORTED')
    await settle()

    expect(loader.failure('10/0/0')).toBeUndefined()
  })
})

describe('ending', () => {
  it('cancels what is on its way and lets go of the images when the map goes', async () => {
    const { loader, asked, cancelled, disposed } = rig()
    loader.want(row(3))
    asked[0]?.resolve()
    await settle()
    loader.close()

    expect(cancelled).toEqual(['10/1/0', '10/2/0'])
    expect(disposed).toEqual(['image'])
    expect(loader.get('10/0/0')).toBeUndefined()
    asked[1]?.resolve()
    await settle()
    expect(loader.get('10/1/0')).toBeUndefined()
  })

  it('ignores the answer of a tile asked for before the settings changed', async () => {
    const { loader, asked, disposed } = rig()
    loader.want(row(1))
    loader.forgetFailures()
    asked[0]?.resolve()
    await settle()

    expect(disposed).toEqual(['image'])
    expect(asked).toHaveLength(2)
  })
})
