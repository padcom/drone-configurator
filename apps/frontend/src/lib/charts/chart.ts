// What a line chart is made of, without Vue or the DOM: the points of a series (a value, and the lowest and highest the point
// stands for), the scales, the ticks, the paths, and the point nearest to a place. A value that is absent is `null`: the line
// has a gap there, it is never drawn as a zero. A spike that is one sample wide survives the thinning of a long series
// (`decimate` keeps the lowest and the highest of each bucket), so a chart of a million samples shows the one that mattered.

/** One point of a series. */
export interface ChartPoint {
  /** Where it is along the bottom (seconds, usually). */
  x: number
  /** Its value, or null where there is none (a gap in the line). */
  y: number | null
  /** The lowest value it stands for (the point is a bucket of samples), when it differs from `y`. */
  min?: number
  /** The highest value it stands for. */
  max?: number
}

/** A raw sample, before it is thinned. */
export interface Sample {
  /**
   *
   */
  x: number
  /**
   *
   */
  y: number | null
}

/** A scale from a domain (values) to a range (places). */
export type Scale = (value: number) => number

/** Where the points of a series are, as drawn. */
export interface Drawn {
  /** The line: one `M ... L ...` for each run of points that have a value. */
  line: string
  /** The points that stand alone (a run of one), drawn as dots, since a line has no length there. */
  dots: Array<[number, number]>
  /** The envelope: the area between the lowest and the highest of each run, and a stroke for a run of one. */
  envelope: string
}

/** The lowest and highest of a series along each axis. */
export interface Extent {
  /**
   *
   */
  x: [number, number]
  /**
   *
   */
  y: [number, number]
}

/**
 * A number that can be drawn, else null.
 *
 * @param value a value that came from a vehicle or a log, which can hold NaN or an infinity
 * @returns the value when it is a finite number, else null
 */
function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The value of a point, 0 where it has none (the callers have left those out).
 *
 * @param point the point
 * @returns its value
 */
const valueOf = (point: ChartPoint): number => finiteOrNull(point.y) ?? 0

/**
 * The lowest value a point stands for.
 *
 * @param point the point
 * @returns its `min` when that is a number, else its value
 */
const lowOf = (point: ChartPoint): number => finiteOrNull(point.min) ?? valueOf(point)

/**
 * The highest value a point stands for.
 *
 * @param point the point
 * @returns its `max` when that is a number, else its value
 */
const highOf = (point: ChartPoint): number => finiteOrNull(point.max) ?? valueOf(point)

/**
 * Whether a point stands for more than its value (it is a bucket whose samples were not all the same).
 *
 * @param point the point
 * @returns true when its lowest or highest is not its value
 */
const isWide = (point: ChartPoint): boolean => lowOf(point) < valueOf(point) || highOf(point) > valueOf(point)

/**
 * Where a sample is along `x`, 0 for none.
 *
 * @param sample the sample, if there is one
 * @returns its `x`
 */
const placeOf = (sample: Sample | undefined): number => sample ? sample.x : 0

/**
 * Whether a point has a value that can be drawn: a place and a value that are finite numbers. A NaN or an infinity (which
 * telemetry and logs do carry) is absent, like a null, wherever the points are looked at.
 *
 * @param point the point (or sample)
 * @returns true when both its place and its value are finite
 */
export function hasValue(point: Sample): boolean {
  return finiteOrNull(point.x) !== null && finiteOrNull(point.y) !== null
}

/**
 * A point with the lowest and highest values of another, when those are numbers.
 *
 * @param base the point (a place and a value)
 * @param from the point that may have an envelope
 * @returns the point with `min` and `max` that are finite, and without the others
 */
function withEnvelope(base: ChartPoint, from: ChartPoint): ChartPoint {
  const min = finiteOrNull(from.min)
  const max = finiteOrNull(from.max)

  return { ...base, ...min === null ? {} : { min }, ...max === null ? {} : { max } }
}

/**
 * A point that can be drawn: no NaN or infinity anywhere. A value that is not finite is absent (a gap), its envelope is dropped
 * with it, and a point whose place along `x` is not finite is not a point at all.
 *
 * @param point a point as it came
 * @returns the point as it can be drawn, or null when it has no place
 */
function cleanPoint(point: ChartPoint): ChartPoint | null {
  const x = finiteOrNull(point.x)
  const y = finiteOrNull(point.y)

  return x === null ? null : y === null ? { x, y: null } : withEnvelope({ x, y }, point)
}

/**
 * The points of a series as they can be drawn: a value that is NaN or infinite is a gap, never a number (it would put "NaN" in a
 * path and make the scales infinite). Telemetry and logs do carry such values.
 *
 * @param points the points as they came
 * @returns the points without a non-finite number in them
 */
export function cleaned(points: readonly ChartPoint[]): ChartPoint[] {
  return points.flatMap(point => {
    const clean = cleanPoint(point)

    return clean === null ? [] : [clean]
  })
}

/**
 * The point that stands for a bucket of samples.
 *
 * @param bucket the samples (at least one)
 * @returns their middle in `x`, their mean, lowest and highest; absent when none of them has a value
 */
function bucketOf(bucket: readonly Sample[]): ChartPoint {
  const x = (placeOf(bucket[0]) + placeOf(bucket.at(-1))) / 2
  // (Loops, not Math.min(...values): a spread of tens of thousands of numbers is a RangeError.)
  let count = 0
  let sum = 0
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const sample of bucket) {
    const value = finiteOrNull(sample.y)
    if (value !== null) {
      count += 1
      sum += value
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
  }

  return count === 0 ? { x, y: null } : { x, y: sum / count, min: low, max: high }
}

/**
 * Thins a series to at most `maxPoints` points, keeping what a line would lose: each point of the result stands for a bucket of
 * samples, with their mean as its value and their lowest and highest as `min` and `max`. A bucket that has no value at all (the
 * samples are absent) is an absent point, so a gap stays a gap. A series that is short enough is returned as it is.
 *
 * @param raw the samples, in order of `x` (a value that is NaN or infinite is absent)
 * @param maxPoints the most points to return (at least 2)
 * @returns the points
 */
export function decimate(raw: readonly Sample[], maxPoints: number): ChartPoint[] {
  // (A sample with a value that is NaN or infinite is absent; one with no place is left out.)
  const samples = cleaned(raw)
  if (samples.length <= maxPoints) {
    return samples
  }
  const buckets = Math.max(2, Math.floor(maxPoints))
  const size = samples.length / buckets

  const bucket = (b: number): Sample[] => samples.slice(Math.floor(b * size), Math.floor((b + 1) * size))

  return Array.from({ length: buckets }, (_unused, b) => bucketOf(bucket(b)))
}

/**
 * The runs of points that have a value, in order: a gap (an absent point) ends a run.
 *
 * @param points the points
 * @returns the runs
 */
export function runsOf(points: readonly ChartPoint[]): ChartPoint[][] {
  const runs: ChartPoint[][] = []
  let run: ChartPoint[] = []
  const close = (): void => {
    if (run.length > 0) {
      runs.push(run)
    }
    run = []
  }
  for (const point of points) {
    if (hasValue(point)) {
      run.push(point)
    } else {
      close()
    }
  }
  close()

  return runs
}

/**
 * How far the points reach, the envelope included. A series with nothing to draw has no extent.
 *
 * @param points the points of all the series
 * @returns the lowest and highest `x` and `y`, or null when no point has a value
 */
export function extentOf(points: readonly ChartPoint[]): Extent | null {
  // (Loops, not Math.min(...array): a spread of tens of thousands of numbers is a RangeError.)
  const reach: Extent = {
    x: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    y: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
  }
  let any = false
  for (const point of points) {
    if (hasValue(point)) {
      any = true
      reach.x = [Math.min(reach.x[0], point.x), Math.max(reach.x[1], point.x)]
      reach.y = [Math.min(reach.y[0], lowOf(point)), Math.max(reach.y[1], highOf(point))]
    }
  }

  return any ? reach : null
}

/**
 * A domain that has some width: the same two numbers are made a little apart (a flat line is drawn in the middle).
 *
 * @param domain the lowest and highest
 * @returns the same, or one unit either side when they are equal
 */
export function widened(domain: readonly [number, number]): [number, number] {
  const [low, high] = domain

  return low === high ? [low - 1, high + 1] : [low, high]
}

/**
 * A scale between two spans.
 *
 * @param domain the values at either end
 * @param range the places at either end
 * @returns the function that gives the place of a value
 */
export function scaleOf(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = widened(domain)

  return value => range[0] + (value - d0) / (d1 - d0) * (range[1] - range[0])
}

/**
 * Round numbers inside a domain, for the marks along an axis: steps of 1, 2 or 5 times a power of ten.
 *
 * @param domain the lowest and highest
 * @param count about how many marks
 * @returns the marks, in order
 */
export function ticksOf(domain: readonly [number, number], count: number): number[] {
  const [low, high] = widened(domain)
  const rough = (high - low) / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(rough))
  const unit = [1, 2, 5, 10].map(step => step * power).find(step => step >= rough) ?? 10 * power
  const out: number[] = []
  for (let tick = Math.ceil(low / unit) * unit; tick <= high + unit * 1e-9; tick += unit) {
    out.push(Math.round(tick / unit) * unit)
  }

  return out
}

/**
 * A place of a path, rounded so that the text stays short.
 *
 * @param value a place
 * @returns it with two decimals at most
 */
function at(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * The places of a point as the pair of numbers a path has.
 *
 * @param sx the scale along `x`
 * @param sy the scale along `y`
 * @param x the place along `x`
 * @param y the value
 * @returns "x y"
 */
function pair(sx: Scale, sy: Scale, x: number, y: number): string {
  return `${at(sx(x))} ${at(sy(y))}`
}

/**
 * The area between the highest and the lowest values of a run: the highest forward, the lowest back, closed.
 *
 * @param run the points
 * @param sx the scale along `x`
 * @param sy the scale along `y`
 * @returns the path
 */
function areaOf(run: readonly ChartPoint[], sx: Scale, sy: Scale): string {
  const top = run.map(point => pair(sx, sy, point.x, highOf(point)))
  const bottom = run.map(point => pair(sx, sy, point.x, lowOf(point))).reverse()

  return `M${top.join('L')}L${bottom.join('L')}Z`
}

/**
 * Adds a run that is a single point: a dot, and, for a bucket that stands for more, a vertical stroke from its lowest to its
 * highest (a spike one sample wide).
 *
 * @param out what is drawn so far
 * @param point the point
 * @param sx the scale along `x`
 * @param sy the scale along `y`
 */
function addSingle(out: Drawn, point: ChartPoint, sx: Scale, sy: Scale): void {
  out.dots.push([sx(point.x), sy(valueOf(point))])

  if (isWide(point)) {
    out.envelope += `M${pair(sx, sy, point.x, highOf(point))}L${pair(sx, sy, point.x, lowOf(point))}`
  }
}

/**
 * Adds a run to what is drawn.
 *
 * @param out what is drawn so far
 * @param run the points, with a value each
 * @param sx the scale along `x`
 * @param sy the scale along `y`
 */
function addRun(out: Drawn, run: readonly ChartPoint[], sx: Scale, sy: Scale): void {
  const [only] = run
  if (run.length === 1 && only) {
    addSingle(out, only, sx, sy)

    return
  }
  out.line += `M${run.map(point => pair(sx, sy, point.x, valueOf(point))).join('L')}`

  if (run.some(isWide)) {
    out.envelope += areaOf(run, sx, sy)
  }
}

/**
 * Where a series is drawn.
 *
 * @param points the points
 * @param sx the scale along `x`
 * @param sy the scale along `y`
 * @returns the line, the dots and the envelope
 */
export function draw(points: readonly ChartPoint[], sx: Scale, sy: Scale): Drawn {
  const out: Drawn = { line: '', dots: [], envelope: '' }
  for (const run of runsOf(points)) {
    addRun(out, run, sx, sy)
  }

  return out
}

/**
 * The index of the point whose `x` is nearest to a place, among those `wanted` accepts.
 *
 * @param points the points
 * @param x the place
 * @param wanted which points count
 * @returns the index, or -1 when none does
 */
function nearestWhere(points: readonly ChartPoint[], x: number, wanted: (point: ChartPoint) => boolean): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  points.forEach((point, index) => {
    const distance = Math.abs(point.x - x)
    if (wanted(point) && distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })

  return best
}

/**
 * The point with a value that is nearest to a place along `x`.
 *
 * @param points the points, in order of `x`
 * @param x the place
 * @returns its index, or -1 when no point has a value
 */
export function nearest(points: readonly ChartPoint[], x: number): number {
  return nearestWhere(points, x, hasValue)
}

/**
 * The point nearest to a place along `x`, whether it has a value or not.
 *
 * @param points the points, in order of `x`
 * @param x the place
 * @returns its index, or -1 when there are no points
 */
export function nearestAny(points: readonly ChartPoint[], x: number): number {
  return nearestWhere(points, x, () => true)
}

/**
 * The point with a value a number of steps from another, along the series (a step skips the gaps).
 *
 * @param points the points, in order of `x`
 * @param from the index of the point to start from (-1: none yet)
 * @param steps how many points to move; negative goes back
 * @returns the index it arrives at (the first or last point with a value if it runs out), or -1 when none has a value
 */
export function stepFrom(points: readonly ChartPoint[], from: number, steps: number): number {
  const valued = points.flatMap((point, index) => hasValue(point) ? [index] : [])
  const here = valued.indexOf(from)
  // Without a point to start from, the steps start at an end: the first for forward, past the last for back.
  const start = here >= 0 ? here : (steps < 0 ? valued.length : -1)
  const to = Math.min(valued.length - 1, Math.max(0, start + steps))

  return valued[to] ?? -1
}

/** A series as the readout sees it: its name and its points. */
export interface Named {
  /**
   *
   */
  label: string
  /**
   *
   */
  points: readonly ChartPoint[]
}

/** How the readout writes what it has: a place along `x`, a value, and the words for a series that has no value there. */
export interface Writing {
  /**
   *
   */
  formatX: (value: number) => string
  /**
   *
   */
  formatY: (value: number) => string
  /**
   *
   */
  noValue: string
}

/**
 * The middle of some numbers.
 *
 * @param numbers the numbers
 * @returns the one in the middle when they are in order, 0 for none
 */
function medianOf(numbers: readonly number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b)

  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/**
 * How far apart the points of a series usually are: the median distance between neighbours, worked out from about a hundred
 * pairs spread over the series (so that a series of a million points costs no more than a short one).
 *
 * @param points the points, in order of `x`
 * @returns the spacing along `x`; 0 for a series of fewer than two points
 */
export function spacingOf(points: readonly ChartPoint[]): number {
  const stride = Math.max(1, Math.floor(points.length / 100))
  const gaps: number[] = []
  for (let index = stride; index < points.length; index += stride) {
    gaps.push((placeOf(points[index]) - placeOf(points[index - stride])) / stride)
  }

  return medianOf(gaps)
}

/**
 * The sample of a series that stands for a place: the nearest one, if it is within half the series' usual spacing (a series
 * that ended long before the place, or has not begun, has nothing there; its last value is not its value now).
 *
 * @param points the points, in order of `x`
 * @param x the place along `x`
 * @returns the point, or undefined when the series does not reach the place
 */
export function pointAt(points: readonly ChartPoint[], x: number): ChartPoint | undefined {
  const point = points[nearestAny(points, x)]

  return point && Math.abs(point.x - x) <= spacingOf(points) / 2 + 1e-9 ? point : undefined
}

/**
 * Whether a point stands for samples that differ: it has a lowest and a highest value, and they are not the same.
 *
 * @param point the point
 * @returns true for a point that is a range
 */
function spreads(point: ChartPoint): boolean {
  return point.min !== undefined && point.max !== undefined && point.min !== point.max
}

/**
 * What a point says to the reader. A point that stands for several samples (a part of a thinned series whose lowest and highest
 * values differ) says the RANGE of its samples: its `y` is only where the line is drawn, and is not a value that any sample had
 * (a roll that swung from -40 to 40 would read 0). A point of one value says that value.
 *
 * @param point the point, which has a value
 * @param writing how to write it
 * @returns the text
 */
function rangeOrValue(point: ChartPoint, writing: Writing): string {
  if (spreads(point)) {
    return `${writing.formatY(point.min as number)} … ${writing.formatY(point.max as number)}`
  }

  return point.y === null ? writing.noValue : writing.formatY(point.y)
}

/**
 * What every series has at a place, written: "12 s: Altitude 3.4 m; Speed no value". A series says "no value" where its sample
 * has none, and where it does not reach the place at all (see `pointAt`): it is never given a reading from somewhere else.
 *
 * @param series the series
 * @param x the place along `x`
 * @param writing how to write it
 * @returns the text
 */
export function readoutOf(series: readonly Named[], x: number, writing: Writing): string {
  const parts = series.map(line => {
    const point = pointAt(line.points, x)

    return `${line.label} ${point && hasValue(point) ? rangeOrValue(point, writing) : writing.noValue}`
  })

  return `${writing.formatX(x)}: ${parts.join('; ')}`
}

/** What a key does to the cursor: not a key of the cursor, let it go, or move it to a place (null: nowhere). */
export type CursorMove = { kind: 'ignore' } | { kind: 'release' } | { kind: 'to', x: number | null }

/**
 * How many samples a key moves the cursor.
 *
 * @param key the key's name
 * @param shift whether Shift is down
 * @param length how many points the series has
 * @returns the steps (negative goes back), or undefined for a key that is none of the cursor's
 */
function stepOfKey(key: string, shift: boolean, length: number): number | undefined {
  const size = shift ? 10 : 1

  return ({ ArrowRight: size, ArrowLeft: -size, Home: -length, End: length } as Record<string, number | undefined>)[key]
}

/**
 * The place `steps` samples from the cursor.
 *
 * @param points the points of the series the cursor follows
 * @param current the place of the cursor, or null
 * @param steps how many samples; negative goes back
 * @returns the place, or null when no point has a value
 */
function placeAfter(points: readonly ChartPoint[], current: number | null, steps: number): number | null {
  const index = current === null ? -1 : nearest(points, current)
  const to = points[stepFrom(points, index, steps)]

  return to ? to.x : null
}

/**
 * What a key does to the cursor of a chart: Left and Right move it a sample (ten with Shift), Home and End go to the ends, and
 * Escape lets it go.
 *
 * @param key the key's name
 * @param shift whether Shift is down
 * @param points the points of the series the cursor follows
 * @param current the place of the cursor, or null
 * @returns what to do
 */
export function moveByKey(key: string, shift: boolean, points: readonly ChartPoint[], current: number | null): CursorMove {
  if (key === 'Escape') {
    return { kind: 'release' }
  }
  const step = stepOfKey(key, shift, points.length)
  if (step === undefined) {
    return { kind: 'ignore' }
  }

  return { kind: 'to', x: placeAfter(points, current, step) }
}

/**
 * The place along `x` that a pointer is over.
 *
 * @param clientX the pointer's place on the page
 * @param left the left edge of the plot on the page
 * @param width the width of the plot
 * @param domain the values at the plot's ends
 * @returns the value, or null for a plot with no width
 */
export function valueAtPointer(clientX: number, left: number, width: number, domain: readonly [number, number]): number | null {
  return width > 0 ? domain[0] + (clientX - left) / width * (domain[1] - domain[0]) : null
}
