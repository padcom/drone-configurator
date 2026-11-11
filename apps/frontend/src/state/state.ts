// Everything the components show, as one type: each field is held by one of the composables (useVehicle, useParams,
// useMetadata, useSnapshots) or by useConfigurator (the last failure), and reaches the components as a ref.
import type { Connection, Param, SerialPort, Telemetry } from '@/generated/app'
import type { Initial } from '@/lib/params/initialValues'
import type { Metadata } from '@/lib/params/metadata'
import type { Review } from '@/lib/params/snapshot'
import type { ListState } from '@/composables/useParams'

/** How a change of a snapshot went when it was applied. */
export interface AppliedChange {
  /** The parameter's id. */
  id: string
  /** Whether the vehicle read back what was written. */
  outcome: 'verified' | 'changed' | 'failed'
  /** What to tell the user about it. */
  detail: string
}

/** Everything the components show. */
export interface State {
  /** The connection's state, and the vehicle found. */
  connection: Connection
  /** Every parameter, as downloaded. */
  params: Param[]
  /** `loading`, or how the last download ended. */
  list: ListState
  /** The indexes that never arrived. */
  missing: number[]
  /** What the user typed to narrow the list. */
  filter: string
  /** The values at the last complete download: what "changed" is measured against, and what a reset puts back. */
  initial: Initial | null
  /** The selected parameter's id. */
  selected: string | null
  /** The new value as typed. */
  draft: string
  /** Why the draft is not a valid value. */
  draftError: string | null
  /** What the metadata finds unusual about the draft (outside its range, not among its values); the write is still allowed. */
  draftWarning: string | null
  /** The latest telemetry. */
  telemetry: Telemetry | null
  /** Why the last thing failed. */
  error: string | null
  /** Why the vehicle session ended without the user asking (a backend restart). */
  notice: string | null
  /** A loaded snapshot under review. */
  importReview: Review | null
  /** Why the last snapshot could not be loaded. */
  importError: string | null
  /** The changes the user ticked (nothing is ticked at first: no unattended bulk writes). */
  picked: string[]
  /** Whether a snapshot is being applied. */
  applying: boolean
  /** How each applied change went, in order; applying stops at the first that didn't verify. */
  applied: AppliedChange[]
  /** The parameters as they were before applying a snapshot (a snapshot's JSON). */
  backup: string | null
  /** The backend machine's serial ports, as last listed. */
  ports: SerialPort[]
  /** Loaded parameter metadata (empty: none). */
  metadata: Metadata
  /** Why the last metadata file wasn't loaded. */
  metadataError: string | null
  /** How many times a metadata file was tried (loaded or not): goes up with each, so that the same result twice is still news. */
  metadataLoads: number
}
