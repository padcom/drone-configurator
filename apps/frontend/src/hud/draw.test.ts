import { describe, expect, it } from 'vitest'
import { telemetryAt } from '../fixtures'
import { STALE_MS } from '../telemetryCards'
import { formatFor } from '../useFormat'
import { type HudContext, type HudStyle, MISSING, drawHud } from './draw'
import { hudModel } from './model'

const STYLE: HudStyle = {
  size: { width: 400, height: 300 },
  theme: { sky: '#08f', ground: '#840', line: '#fff', text: '#ddd', warn: '#fa0', unknown: '#555' },
  format: formatFor('en'),
  noAttitude: 'NO ATTITUDE',
}
const NBSP = ' '
const METHODS = [
  'save', 'restore', 'translate', 'rotate', 'beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'stroke', 'fillRect',
]

/** One recorded call. */
interface Call {
  /** The method. */
  name: string
  /** Its arguments. */
  args: unknown[]
  /** The opacity at the time. */
  alpha: number
}

/**
 * A context that records every call, with its arguments and the opacity it was made with.
 *
 * @returns the context and the calls
 */
function recorder() {
  const calls: Call[] = []
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1 }
  for (const name of [...METHODS, 'fillText']) {
    ctx[name] = (...args: unknown[]) => calls.push({ name, args, alpha: ctx.globalAlpha as number })
  }

  return { ctx: ctx as unknown as HudContext, calls, raw: ctx }
}

/**
 * The texts that were written.
 *
 * @param calls the recorded calls
 * @returns the texts, in order
 */
const textsOf = (calls: Call[]) => calls.filter(call => call.name === 'fillText').map(call => call.args[0])

describe('drawing the HUD', () => {
  it('writes the values with their units, with degrees and percent right after the number', () => {
    const { ctx, calls } = recorder()

    drawHud(ctx, hudModel(telemetryAt(5)), STYLE)

    expect(textsOf(calls)).toContain(`20.0${NBSP}m`)
    expect(textsOf(calls)).toContain('LOITER')
    expect(textsOf(calls).filter(text => /^\d+[°%]$/u.test(String(text)))).toHaveLength(2)
  })

  it('leaves the context as it found it: saves and restores are balanced', () => {
    const { ctx, calls } = recorder()

    drawHud(ctx, hudModel(telemetryAt(5)), STYLE)
    const count = (name: string) => calls.filter(call => call.name === name).length

    expect(count('save')).toBe(count('restore'))
    expect(calls.at(-1)?.name).toBe('restore')
  })
})

describe('drawing the HUD, on a context that restores', () => {
  it('does not leave its line width or opacity on the context', () => {
    const { ctx, raw } = recorder()
    raw.lineWidth = 7
    const { restore } = ctx
    const saved: unknown[] = []
    ctx.save = () => saved.push([raw.lineWidth, raw.globalAlpha])

    ctx.restore = () => {
      const [width, alpha] = saved.pop() as number[]
      raw.lineWidth = width
      raw.globalAlpha = alpha
      restore()
    }

    drawHud(ctx, hudModel(telemetryAt(5)), STYLE)

    expect([raw.lineWidth, raw.globalAlpha]).toEqual([7, 1])
  })
})

describe('drawing the horizon', () => {
  it('turns against the roll: a right wing down turns the picture anticlockwise', () => {
    const { ctx, calls } = recorder()
    const t = telemetryAt(5)

    drawHud(ctx, hudModel({ ...t, attitude: { ...t.attitude!, roll: 30, pitch: 0 } }), STYLE)

    expect(calls.find(call => call.name === 'rotate')?.args[0]).toBeCloseTo(-Math.PI / 6)
  })

  it('moves the horizon down for a nose up pitch, by the pitch scale of the height', () => {
    const { ctx, calls } = recorder()
    const t = telemetryAt(5)

    drawHud(ctx, hudModel({ ...t, attitude: { ...t.attitude!, roll: 0, pitch: 10 } }), STYLE)
    const ground = calls.filter(call => call.name === 'fillRect')[1]!

    expect(ground.args[1]).toBeCloseTo(10 * 0.012 * 300)
  })
})

describe('drawing the horizon, at the edges', () => {
  it('reaches by the diagonal, so a turned picture leaves no corner bare', () => {
    const { ctx, calls } = recorder()

    drawHud(ctx, hudModel(telemetryAt(5)), { ...STYLE, size: { width: 1000, height: 100 } })
    const sky = calls.filter(call => call.name === 'fillRect')[0]!

    expect(sky.args[2]).toBeGreaterThanOrEqual(2 * Math.hypot(1000, 100))
  })

  it('is dimmed when the attitude is the last that was heard', () => {
    const { ctx, calls } = recorder()
    const t = telemetryAt(5)

    drawHud(ctx, hudModel({ ...t, attitude: { ...t.attitude!, ageMs: STALE_MS + 1 } }), STYLE)

    expect(calls.filter(call => call.name === 'fillRect')[0]?.alpha).toBe(0.45)
  })
})

describe('drawing the HUD without an attitude', () => {
  it('fills with the neutral colour and says so, never a level horizon', () => {
    const { ctx, calls, raw } = recorder()
    const fills: unknown[] = []
    ctx.fillRect = () => fills.push(raw.fillStyle)

    drawHud(ctx, hudModel(undefined), STYLE)

    expect(fills).toEqual([STYLE.theme.unknown])
    expect(textsOf(calls)).toContain('NO ATTITUDE')
    expect(calls.some(call => call.name === 'rotate')).toBe(false)
  })

  it('does the same when only one of roll and pitch is known', () => {
    const { ctx, calls } = recorder()
    const t = telemetryAt(5)

    drawHud(ctx, hudModel({ ...t, attitude: undefined, pitch: undefined }), STYLE)

    expect(textsOf(calls)).toContain('NO ATTITUDE')
  })

  it('writes a dash for every other value that is absent, and no zero', () => {
    const { ctx, calls } = recorder()

    drawHud(ctx, hudModel(undefined), STYLE)

    expect(textsOf(calls)).toEqual(['NO ATTITUDE', ...Array.from({ length: 6 }, () => MISSING)])
  })
})

describe('the cost of a draw', () => {
  it('is the same number of calls however often it is repeated, and small', () => {
    const { ctx, calls } = recorder()
    const model = hudModel(telemetryAt(5))
    drawHud(ctx, model, STYLE)
    const one = calls.length

    for (let i = 0; i < 999; i += 1) {
      drawHud(ctx, model, STYLE)
    }

    expect(calls.length).toBe(one * 1000)
    expect(one).toBeLessThanOrEqual(40)
  })
})
