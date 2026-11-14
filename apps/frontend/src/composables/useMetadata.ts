// Parameter metadata: what a metadata file says about parameters (descriptions, units, ranges, named values), loaded
// from a file the user picks. It talks to the backend through the client (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import { say } from '@/i18n/say'
import { type Metadata, parseMetadata } from '@/lib/params/metadata'

/** What the metadata needs from the rest of the interface. */
export interface MetadataDeps {
  /** The link to the backend (its open dialog gives the file). */
  client: BackendClient
  /** Keeps the path of a file that was loaded (the settings hold it, to load it again at start). */
  rememberPath?: (path: string) => void
}

/** The metadata, as refs and actions. */
export interface MetadataModel {
  /** Loaded parameter metadata, by parameter id (empty: none). */
  readonly metadata: ShallowRef<Metadata>
  /** Why the last file wasn't loaded, or null. */
  readonly error: ShallowRef<string | null>
  /** How many files were tried (loaded or not; a file that could not be opened too): the result of each is to be told. */
  readonly loads: ShallowRef<number>
  /** Loads parameter metadata (replacing what was loaded). */
  load: (text: string) => void
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

/** The metadata. */
class ParamMetadata implements MetadataModel {
  readonly metadata = shallowRef<Metadata>(new Map())
  readonly error = shallowRef<string | null>(null)
  readonly loads = shallowRef(0)

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

    return true
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
