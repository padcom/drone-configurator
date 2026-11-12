// The arithmetic of the spectrum chart: the paths of the amplitude of each axis against frequency, and the marks along the axes.
// Pure functions; the chart (SpectrumChart.vue) only draws what they say. The frequency axis is linear from 0 to the Nyquist
// frequency, the amplitude axis from 0 to the largest amplitude drawn (a spectrum is never cut, and a flat line is a flat line).

/** The size of the drawing's box. */
export interface Box {
  /**
   *
   */
  width: number
  /**
   *
   */
  height: number
}

/** A line of the plot. */
export interface PlotLine {
  /** The axis it is of. */
  name: string
  /** The path data. */
  d: string
}

/** A mark along an axis. */
export interface Tick {
  /** Its place in the box. */
  at: number
  /** Its label. */
  label: string
}

/** The amplitude of the bins of one axis. */
export interface SpectrumLine {
  /** The axis. */
  name: string
  /** The amplitude of each bin. */
  amplitude: readonly number[]
}

/** What the chart draws. */
export interface Plot {
  /** The lines, one for each axis. */
  lines: PlotLine[]
  /** The largest amplitude of the plot (the top of the amplitude axis); 0 for nothing to draw. */
  top: number
  /** The marks along the frequency axis. */
  xTicks: Tick[]
  /** The marks along the amplitude axis. */
  yTicks: Tick[]
}

/**
 * A step for the marks of an axis that gives about `count` of them: 1, 2 or 5 times a power of ten.
 *
 * @param span the length of the axis in its unit
 * @param count about how many marks
 * @returns the step
 */
export function niceStep(span: number, count: number): number {
  const raw = span / count
  if (!(raw > 0) || !Number.isFinite(raw)) {
    return 1
  }
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power

  return power * ([5, 2, 1].find(multiple => unit >= multiple) ?? 1)
}

/**
 * The marks of an axis from 0 to `span`.
 *
 * @param span the length of the axis
 * @param length its length in the box
 * @param label how a value is written
 * @returns the marks
 */
function ticks(span: number, length: number, label: (value: number) => string): Tick[] {
  const step = niceStep(span, 6)
  const out: Tick[] = []
  for (let value = 0; value <= span + step * 1e-9; value += step) {
    out.push({ at: (value / span) * length, label: label(value) })
  }

  return out
}

/**
 * One path: the points of the amplitude of an axis, the first bin on the left and the last (the Nyquist frequency) on the right.
 *
 * @param amplitude the amplitudes
 * @param top the largest amplitude of the plot
 * @param box the box
 * @returns the path data
 */
function pathOf(amplitude: readonly number[], top: number, box: Box): string {
  const last = Math.max(1, amplitude.length - 1)

  return amplitude.map((value, k) => {
    const x = ((k / last) * box.width).toFixed(1)
    const y = (box.height - (Math.min(value, top) / top) * box.height).toFixed(1)

    return `${k === 0 ? 'M' : 'L'}${x},${y}`
  }).join('')
}

/**
 * The plot of the amplitude spectra of the axes.
 *
 * @param axes the amplitude of each bin, by axis (every axis has the same bins)
 * @param nyquist the frequency of the last bin (Hz)
 * @param box the box to draw in
 * @param format writes a number for a label
 * @returns what to draw; nothing when there is no amplitude above zero
 */
export function plotOf(axes: readonly SpectrumLine[], nyquist: number, box: Box, format: (value: number) => string): Plot {
  const top = Math.max(0, ...axes.flatMap(axis => axis.amplitude.filter(Number.isFinite)))
  if (!(top > 0) || !(nyquist > 0)) {
    return { lines: [], top: 0, xTicks: [], yTicks: [] }
  }
  const lines = axes.map(axis => ({ name: axis.name, d: pathOf(axis.amplitude, top, box) }))
  const yTicks = ticks(top, box.height, format).map(tick => ({ ...tick, at: box.height - tick.at }))

  return { lines, top, xTicks: ticks(nyquist, box.width, format), yTicks }
}
