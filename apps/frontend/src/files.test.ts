import { afterEach, describe, expect, it, vi } from 'vitest'
import { chosenText, download, hasHost, saveText, snapshotFileName } from './files'
import { VEHICLE } from './fixtures'

afterEach(() => {
  vi.restoreAllMocks()
  delete window.picoDesktop
})

describe('snapshotFileName', () => {
  it('names what it is, the vehicle and the time, without characters a file name dislikes', () => {
    const now = new Date(Date.UTC(2026, 10, 9, 12, 30, 5))

    expect(snapshotFileName('params', { ...VEHICLE }, now)).toBe('params-quadrotor-1-2026-11-09T123005.json')
    expect(snapshotFileName('backup', undefined, now)).toBe('backup-vehicle-2026-11-09T123005.json')
  })
})

describe('hasHost', () => {
  it('is true only inside Pico Desktop', () => {
    expect(hasHost()).toBe(false)

    window.picoDesktop = {} as never

    expect(hasHost()).toBe(true)
  })
})

describe('download', () => {
  it('offers the text as a JSON file with the name, and lets go of the URL later', () => {
    vi.useFakeTimers()
    const blobs: Blob[] = []
    const create = vi.fn((blob: Blob) => {
      blobs.push(blob)

      return 'blob:x'
    })
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    download('{"a":1}', 'params.json')

    expect(click).toHaveBeenCalledTimes(1)
    expect(blobs[0]?.type).toBe('application/json')
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:x')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})

describe('saveText', () => {
  it('goes through the host\'s save dialog in Pico Desktop, and downloads in a browser', () => {
    const app = { saveFile: vi.fn().mockResolvedValue(null) }
    window.picoDesktop = {} as never

    saveText(app, 'text', 'name.json')

    expect(app.saveFile).toHaveBeenCalledWith('name.json', 'text')
  })

  it('does not ask the host when there is none', () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const app = { saveFile: vi.fn() }

    saveText(app, 'text', 'name.json')

    expect(app.saveFile).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('chosenText', () => {
  it('reads the chosen file and empties the input, so the same file can be chosen again', async () => {
    const input = document.createElement('input')
    input.type = 'file'
    const file = new File(['hello'], 'a.json')
    Object.defineProperty(input, 'files', { value: [file], configurable: true })

    expect(await chosenText(input)).toBe('hello')
    expect(input.value).toBe('')
  })

  it('is null when no file was chosen', async () => {
    const input = document.createElement('input')
    input.type = 'file'

    expect(await chosenText(input)).toBeNull()
  })
})
