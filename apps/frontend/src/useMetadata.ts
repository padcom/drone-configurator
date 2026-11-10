// Parameter metadata: what a metadata file says about parameters (descriptions, units, ranges, named values), loaded
// from a file the user picks. It talks to the backend through the client (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import { type Metadata, parseMetadata } from './metadata'

/** What the metadata needs from the rest of the interface. */
export interface MetadataDeps {
  /** The link to the backend (its open dialog gives the file). */
  client: BackendClient
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
  /** Lets the user pick a metadata file (the host's open dialog) and loads it. */
  openFile: () => Promise<void>
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
    const loaded = parseMetadata(text)
    if (typeof loaded === 'string') {
      this.error.value = `Can't load the metadata: ${loaded}.`
    } else {
      this.metadata.value = loaded
      this.error.value = null
    }
    this.loads.value += 1
  }

  async openFile(): Promise<void> {
    try {
      const { text } = await this.deps.client.call('files.open', null)
      if (text !== undefined) {
        this.load(text)
      }
    } catch (error) {
      this.error.value = `Couldn't open it: ${describeError(error)}`
      this.loads.value += 1
    }
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
