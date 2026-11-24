// Parameter metadata: what a metadata file says about parameters (descriptions, units, ranges, named values), downloaded from
// ArduPilot's server for the connected vehicle (the backend's `metadata.fetch`, which keeps it on disk: #35), or loaded from a
// file the user picks. It talks to the backend through the client (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import type { MetadataFile, MetadataProgress, MetadataVehicle } from '@/generated/app'
import { say } from '@/i18n/say'
import { type Metadata, parseMetadata } from '@/lib/params/metadata'

/** What the metadata needs from the rest of the interface. */
export interface MetadataDeps {
  /** The link to the backend (its open dialog gives the file). */
  client: BackendClient
  /** Keeps the path of a file that was loaded (the settings hold it, to load it again at start). */
  rememberPath?: (path: string) => void
}

/** Where the metadata in use came from: nothing, a file the user loaded, or ArduPilot's server. */
export type MetadataSource = 'none' | 'file' | 'download'

/** What the last download gave: for which vehicle and version, and how it came. */
export interface DownloadedMetadata {
  /** The kind of vehicle. */
  vehicle: MetadataVehicle
  /** The firmware version the vehicle said (absent when it said no released one). */
  version?: string
  /** Whether the file is that version's (false: the latest, which may differ). */
  exact: boolean
  /** It came from this computer's cache, not the server just now. */
  fromCache: boolean
  /** It is the latest file, past its time, given because the server could not be reached. */
  stale: boolean
  /** When the server gave it (ms since 1970). */
  fetchedAt: number
  /** How long it took to get and read (ms). */
  loadMs: number
  /** How many parameters it describes. */
  count: number
}

/** The metadata, as refs and actions. */
export interface MetadataModel {
  /** Loaded parameter metadata, by parameter id (empty: none). */
  readonly metadata: ShallowRef<Metadata>
  /** Why the last file wasn't loaded, or null. */
  readonly error: ShallowRef<string | null>
  /** How many files were tried (loaded or not; a file that could not be opened too): the result of each is to be told. */
  readonly loads: ShallowRef<number>
  /** Where the metadata in use came from. */
  readonly source: ShallowRef<MetadataSource>
  /** What the last download that worked gave (null until one did). */
  readonly downloaded: ShallowRef<DownloadedMetadata | null>
  /** Why the last download did not give metadata, or null. */
  readonly downloadError: ShallowRef<string | null>
  /** Whether a download runs. */
  readonly downloading: ShallowRef<boolean>
  /** How far the download from the server that runs is (null when none runs, or the file comes from the cache). */
  readonly progress: ShallowRef<MetadataProgress | null>
  /** Loads parameter metadata (replacing what was loaded). */
  load: (text: string) => void
  /**
   * Downloads the connected vehicle's metadata (from the cache when it has it, unless `refresh`) and uses it. One that does not
   * come leaves what is in use, unless it was downloaded for a vehicle (it may be another kind's: nothing is invented, so it
   * goes).
   * A file from the cache that cannot be read is asked for again from the server.
   *
   * @returns what was downloaded, or null when nothing was (the reason is in `downloadError`)
   */
  download: (options?: { refresh?: boolean }) => Promise<DownloadedMetadata | null>
  /** Lets the user pick a metadata file (the host's open dialog) and loads it; the path of a file that loaded is kept. */
  openFile: () => Promise<void>
  /**
   * Loads the file at a path (the one the settings hold), the way a file the user picked is loaded. What goes wrong is in `error`
   * and given back, with the path. It is not counted in `loads`: the result is not a file the user just tried, so the page that
   * tells those does not tell it (whoever asked tells it).
   *
   * @returns why it was not loaded, or null when it was
   */
  loadFrom: (path: string) => Promise<string | null>
}

/**
 * How long the answer of `metadata.fetch` is waited for: longer than the backend may take for a download (20 minutes, in parts
 * that each must come within 30 s: a slow link that makes progress gets the file), which then answers with why it gave up.
 */
const FETCH_WAIT_MS = 25 * 60_000

/** The metadata. */
class ParamMetadata implements MetadataModel {
  readonly metadata = shallowRef<Metadata>(new Map())
  readonly error = shallowRef<string | null>(null)
  readonly loads = shallowRef(0)
  readonly source = shallowRef<MetadataSource>('none')
  readonly downloaded = shallowRef<DownloadedMetadata | null>(null)
  readonly downloadError = shallowRef<string | null>(null)
  readonly downloading = shallowRef(false)
  readonly progress = shallowRef<MetadataProgress | null>(null)

  /**
   * Makes the metadata.
   *
   * @param deps the client
   */
  constructor(private readonly deps: MetadataDeps) {}

  load(text: string): void {
    this.tried(text, undefined)
  }

  /**
   * Takes the text of a file the user tried: it is counted, and the path of one that is metadata is kept.
   *
   * @param text the file's text
   * @param path where it is from, when the dialog said
   */
  private tried(text: string, path: string | undefined): void {
    const loaded = this.adopt(text, null)
    this.loads.value += 1

    if (loaded && path !== undefined) {
      this.deps.rememberPath?.(path)
    }
  }

  /**
   * Takes the text of a file: the metadata it holds, or why it is not.
   *
   * @param text the file's text
   * @param path where it is from, when it is a file the settings name (the words then say which)
   * @returns whether it was metadata
   */
  private adopt(text: string, path: string | null): boolean {
    const loaded = parseMetadata(text)
    if (typeof loaded === 'string') {
      const reason = loaded
      this.error.value = path === null ? say('notice.metadataLoad', { reason }) : say('notice.metadataLoadFrom', { path, reason })

      return false
    }
    this.metadata.value = loaded
    this.error.value = null
    this.source.value = 'file'

    return true
  }

  async download(options: { refresh?: boolean } = {}): Promise<DownloadedMetadata | null> {
    const started = performance.now()
    this.downloading.value = true
    const stop = this.deps.client.onEvent('metadata.progress', progress => {
      this.progress.value = progress
    })

    try {
      return this.took(await this.fetchReadable(options.refresh === true), started)
    } catch (error) {
      return this.notDownloaded(describeError(error), options.refresh === true)
    } finally {
      stop()
      this.progress.value = null
      this.downloading.value = false
    }
  }

  /**
   * Asks the backend for the file, and reads it: a file from the cache that cannot be read is asked for again from the server.
   *
   * @param refresh whether the server is asked even when the cache has the file
   * @returns the file and what it says, or why it is not metadata
   */
  private async fetchReadable(refresh: boolean): Promise<{ file: MetadataFile, read: Metadata | string }> {
    const file = await this.deps.client.call('metadata.fetch', refresh ? { refresh } : {}, { timeoutMs: FETCH_WAIT_MS })
    const read = parseMetadata(file.text)
    if (typeof read === 'string' && file.fromCache) {
      return this.fetchReadable(true)
    }

    return { file, read }
  }

  /**
   * Uses what a download gave.
   *
   * @param got the file and what it says
   * @param got.file the file
   * @param got.read what it says, or why it is not metadata
   * @param started when the download started (performance.now())
   * @returns what was downloaded, or null when it is not metadata
   */
  private took({ file, read }: { file: MetadataFile, read: Metadata | string }, started: number): DownloadedMetadata | null {
    if (typeof read === 'string') {
      return this.notDownloaded(read, false)
    }
    const { vehicle, version, exact, fromCache, stale, fetchedAt } = file
    const loadMs = performance.now() - started
    this.metadata.value = read
    this.source.value = 'download'
    this.downloadError.value = null
    this.downloaded.value = { vehicle, version, exact, fromCache, stale, fetchedAt: Number(fetchedAt), loadMs, count: read.size }

    return this.downloaded.value
  }

  /**
   * A download that gave nothing: says why, and drops metadata that was downloaded for a vehicle, unless this was the refresh of
   * it (the same vehicle's).
   *
   * @param reason why
   * @param refresh whether it was a refresh
   * @returns null
   */
  private notDownloaded(reason: string, refresh: boolean): null {
    this.downloadError.value = reason

    if (!refresh && this.source.value === 'download') {
      this.metadata.value = new Map()
      this.source.value = 'none'
      this.downloaded.value = null
    }

    return null
  }

  async openFile(): Promise<void> {
    try {
      const { path, text } = await this.deps.client.call('files.open', null)
      if (text !== undefined) {
        this.tried(text, path)
      }
    } catch (error) {
      this.error.value = say('notice.open', { error: describeError(error) })
      this.loads.value += 1
    }
  }

  async loadFrom(path: string): Promise<string | null> {
    try {
      const { text } = await this.deps.client.call('files.read', { path })
      this.adopt(text, path)
    } catch (error) {
      this.error.value = say('notice.metadataReadFrom', { path, error: describeError(error) })
    }

    return this.error.value
  }
}

/**
 * Makes the metadata.
 *
 * @param deps the client
 * @returns the refs and the actions
 */
export function useMetadata(deps: MetadataDeps): MetadataModel {
  return new ParamMetadata(deps)
}
