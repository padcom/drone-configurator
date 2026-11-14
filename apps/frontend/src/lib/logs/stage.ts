// Before and after the filter: which of the raw IMU sources of a log is the data the vehicle's filters have not touched and which
// is what they leave. The backend says it of each source (`postFilter`, from the log's own INS_LOG_BAT_OPT; absent when it cannot
// be said). The "after" of a sensor is only ever a source the log holds and the backend marked as after the filter: where there
// is none, the page says why. No curve is made up from a model of the filters.
import type { BatchSource } from '@/generated/app'

/**
 * What the log holds of the data after the filter for the source that is shown: the source shown IS after the filters (`self`);
 * the source after the filters that is the same IMU (`pair`); or none, and why (`none`): the log does not say, it has only data
 * before the filter, or the matching IMU's was not logged.
 */
export type AfterFilter
  = { state: 'self' }
    | { state: 'pair', source: BatchSource }
    | { state: 'none', why: 'unknown' | 'onlyBefore' | 'noMatch' }

/** How a source is told in the list: before the filter, after it, or not known. */
export type Stage = 'before' | 'after' | 'unknown'

/**
 * Whether a source is before or after the filter, as the backend says.
 *
 * @param source the source
 * @returns the stage
 */
export function stageOf(source: Pick<BatchSource, 'postFilter'>): Stage {
  if (source.postFilter === undefined) {
    return 'unknown'
  }

  return source.postFilter ? 'after' : 'before'
}

/**
 * The lowest instance of a sensor at a stage.
 *
 * @param sources the sources of the log
 * @param sensor the sensor
 * @param after whether the stage is after the filter
 * @returns the instance, or undefined when there is none
 */
function lowest(sources: readonly BatchSource[], sensor: BatchSource['sensor'], after: boolean): number | undefined {
  const found = sources.filter(source => source.sensor === sensor && source.postFilter === after).map(source => source.instance)

  return found.length === 0 ? undefined : Math.min(...found)
}

/**
 * The source after the filters that is the same IMU as a source before them.
 *
 * @param sources the sources of the log
 * @param shown the source before the filters
 * @returns the pair, or why there is none
 */
function pairOf(sources: readonly BatchSource[], shown: BatchSource): AfterFilter {
  const after = lowest(sources, shown.sensor, true)
  const before = lowest(sources, shown.sensor, false)
  if (after === undefined || before === undefined) {
    return { state: 'none', why: 'onlyBefore' }
  }
  const instance = shown.instance + (after - before)
  const pair = sources.find(source => source.postFilter === true && source.sensor === shown.sensor
    && source.instance === instance)

  return pair === undefined ? { state: 'none', why: 'noMatch' } : { state: 'pair', source: pair }
}

/**
 * The data after the filters that goes with a source: for a source before them, the source after them of the same IMU (ArduPilot
 * logs it at the instance plus the number of IMUs, the same distance for all of them).
 *
 * @param sources the sources of the log
 * @param shown the source that is shown
 * @returns what there is
 */
export function afterOf(sources: readonly BatchSource[], shown: BatchSource): AfterFilter {
  if (shown.postFilter === true) {
    return { state: 'self' }
  }

  return shown.postFilter === undefined ? { state: 'none', why: 'unknown' } : pairOf(sources, shown)
}
