// Draws the HUD on a canvas 2D context. The context is a narrow interface (what the drawing needs and no more), so a
// test can record the calls and the drawing never touches the DOM.
import type { Format } from '../useFormat'
import type { HudModel, HudValue } from './model'

/** The part of CanvasRenderingContext2D that the HUD uses. */
export type HudContext = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'font' | 'textAlign' | 'textBaseline' | 'globalAlpha'
  | 'save' | 'restore' | 'translate' | 'rotate' | 'beginPath' | 'rect' | 'clip' | 'moveTo' | 'lineTo' | 'stroke'
  | 'fillRect' | 'fillText'>

/** The colours of the HUD (from the theme, as the page resolves them). */
export interface HudTheme {
  /** Above the horizon. */
  sky: string
  /** Below the horizon. */
  ground: string
  /** The horizon line. */
  line: string
  /** The readouts. */
  text: string
  /** The aircraft symbol, and the readouts while armed. */
  warn: string
}

/** The size to draw in, in CSS pixels. */
export interface HudSize {
  /** The width. */
  width: number
  /** The height. */
  height: number
}

/** How to draw: the size, the colours and the number formatters. */
export interface HudStyle {
  /** The size to draw in. */
  size: HudSize
  /** The colours. */
  theme: HudTheme
  /** Formats numbers. */
  format: Format
}

/** What a value is drawn as when the vehicle has not reported it (never a made-up zero). */
export const MISSING = '--'

/** How far the horizon moves for one degree of pitch, as a fraction of the height. */
const PITCH_SCALE = 0.012

/** The opacity of a value that is the last that was heard. */
const STALE_ALPHA = 0.45

/**
 * A value as text: formatted with its unit, or a dash when it is absent.
 *
 * @param item the HUD value
 * @param unit its unit
 * @param format formats numbers
 * @param digits how many decimals
 * @returns the text to draw
 */
export function textOf(item: HudValue, unit: string, format: Format, digits = 0): string {
  return item.value === undefined ? MISSING : format.quantity(item.value, unit, digits)
}

/**
 * The opacity to draw values with: dimmed when any of them is the last that was heard.
 *
 * @param items the values
 * @returns 1, or the stale opacity
 */
function alphaOf(...items: HudValue[]): number {
  return items.some(item => item.stale) ? STALE_ALPHA : 1
}

/**
 * The sky and the ground, turned by roll and moved by pitch, with the line between them.
 *
 * @param ctx the context
 * @param model what to draw
 * @param size the size
 * @param theme the colours
 */
function drawHorizon(ctx: HudContext, model: HudModel, size: HudSize, theme: HudTheme): void {
  const { width, height } = size
  const roll = model.roll.value ?? 0
  const shift = (model.pitch.value ?? 0) * PITCH_SCALE * height
  ctx.save()
  ctx.globalAlpha = alphaOf(model.roll, model.pitch)
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()
  ctx.translate(width / 2, height / 2)
  ctx.rotate(-roll * Math.PI / 180)
  ctx.fillStyle = theme.sky
  ctx.fillRect(-width * 2, -height * 2 + shift, width * 4, height * 2)
  ctx.fillStyle = theme.ground
  ctx.fillRect(-width * 2, shift, width * 4, height * 2)
  ctx.strokeStyle = theme.line
  ctx.beginPath()
  ctx.moveTo(-width * 2, shift)
  ctx.lineTo(width * 2, shift)
  ctx.stroke()
  ctx.restore()
}

/**
 * The fixed aircraft symbol in the middle.
 *
 * @param ctx the context
 * @param size the size
 * @param theme the colours
 */
function drawSymbol(ctx: HudContext, size: HudSize, theme: HudTheme): void {
  const cx = size.width / 2
  const cy = size.height / 2
  ctx.strokeStyle = theme.warn
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 30, cy)
  ctx.lineTo(cx - 10, cy)
  ctx.lineTo(cx, cy + 8)
  ctx.lineTo(cx + 10, cy)
  ctx.lineTo(cx + 30, cy)
  ctx.stroke()
}

/**
 * One line of text, dimmed when the value is the last that was heard.
 *
 * @param ctx the context
 * @param text what to write
 * @param at where (x, y)
 * @param stale whether to dim it
 */
function drawText(ctx: HudContext, text: string, at: [number, number], stale: boolean): void {
  ctx.globalAlpha = stale ? STALE_ALPHA : 1
  ctx.fillText(text, at[0], at[1])
  ctx.globalAlpha = 1
}

/**
 * The readouts: speed on the left, height and climb on the right, heading on top, battery and mode below.
 *
 * @param ctx the context
 * @param model what to draw
 * @param size the size
 * @param format formats numbers
 */
function drawReadouts(ctx: HudContext, model: HudModel, size: HudSize, format: Format): void {
  const { width, height } = size
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  drawText(ctx, textOf(model.speed, 'm/s', format, 1), [8, height / 2], model.speed.stale)
  ctx.textAlign = 'right'
  drawText(ctx, textOf(model.altitude, 'm', format, 1), [width - 8, height / 2], model.altitude.stale)
  drawText(ctx, textOf(model.climb, 'm/s', format, 1), [width - 8, (height / 2) + 18], model.climb.stale)
  ctx.textAlign = 'center'
  drawText(ctx, textOf(model.heading, '°', format), [width / 2, 14], model.heading.stale)
  drawText(ctx, textOf(model.battery, '%', format), [width / 4, height - 14], model.battery.stale)
  drawText(ctx, model.mode === '' ? MISSING : model.mode, [width * 3 / 4, height - 14], model.silent)
}

/**
 * Draws the whole HUD.
 *
 * @param ctx the context to draw on
 * @param model what to draw
 * @param style the size, the colours and the number formatters
 */
export function drawHud(ctx: HudContext, model: HudModel, style: HudStyle): void {
  const { size, theme, format } = style
  ctx.globalAlpha = 1
  ctx.lineWidth = 1
  ctx.font = '14px sans-serif'
  drawHorizon(ctx, model, size, theme)
  drawSymbol(ctx, size, theme)
  ctx.fillStyle = model.armed ? theme.warn : theme.text
  drawReadouts(ctx, model, size, format)
}
