import { describe, expect, it } from 'vitest'
import {
  BRIEF_MS,
  type Clock,
  DEDUPE_MS,
  ERROR_SHOW_MS,
  MAX_VISIBLE,
  SHOW_MS,
  type Toasts,
  createToasts,
} from './toasts'

/** A clock that only moves when it is told to, and runs the timers that fall due. */
class FakeClock implements Clock {
  time = 0
  next = 1
  timers = new Map<number, { at: number, fn: () => void }>()

  now = () => this.time

  set = (fn: () => void, ms: number) => {
    const id = this.next++
    this.timers.set(id, { at: this.time + ms, fn })

    return id as unknown as ReturnType<typeof setTimeout>
  }

  clear = (timer: ReturnType<typeof setTimeout>) => {
    this.timers.delete(timer as unknown as number)
  }

  /**
   * Moves the clock on, running the timers on the way.
   *
   * @param ms how far
   */
  advance(ms: number): void {
    const to = this.time + ms
    const due = () => [...this.timers.entries()].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0]
    for (let timer = due(); timer; timer = due()) {
      this.timers.delete(timer[0])
      this.time = timer[1].at
      timer[1].fn()
    }
    this.time = to
  }
}

/**
 * A queue on a clock of its own.
 *
 * @returns the queue and its clock
 */
function queue(): { toasts: Toasts, clock: FakeClock } {
  const clock = new FakeClock()

  return { toasts: createToasts(clock), clock }
}

/**
 * The texts that are shown, in order.
 *
 * @param toasts the queue
 * @returns the texts
 */
const shown = (toasts: Toasts) => toasts.visible.value.map(t => t.text)

describe('the toasts that are shown', () => {
  it('are in the order they came, and gone by themselves after their time', () => {
    const { toasts, clock } = queue()

    toasts.push({ severity: 'success', text: 'one' })
    toasts.push({ severity: 'warning', text: 'two' })
    expect(shown(toasts)).toEqual(['one', 'two'])
    clock.advance(SHOW_MS - 1)
    expect(shown(toasts)).toEqual(['one', 'two'])
    clock.advance(1)

    expect(shown(toasts)).toEqual([])
  })
})

describe('the toasts that stay longer', () => {
  it('stay longer when they are errors, and until they are dismissed when they are sticky', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'error', text: 'bad' })
    toasts.push({ severity: 'warning', text: 'stuck', sticky: true })

    clock.advance(SHOW_MS)
    expect(shown(toasts)).toEqual(['bad', 'stuck'])
    clock.advance(ERROR_SHOW_MS - SHOW_MS)
    expect(shown(toasts)).toEqual(['stuck'])
    clock.advance(10 * ERROR_SHOW_MS)

    expect(shown(toasts)).toEqual(['stuck'])
  })
})

describe('the toasts that are asked to stay as long as an error', () => {
  it('stay as long as an error does when they are asked to, though they are not errors', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'warning', text: 'read me', long: true })

    clock.advance(SHOW_MS)
    expect(shown(toasts)).toEqual(['read me'])
    clock.advance(ERROR_SHOW_MS - SHOW_MS)

    expect(shown(toasts)).toEqual([])
  })

  it('can be dismissed', () => {
    const { toasts } = queue()
    toasts.push({ severity: 'success', text: 'one' })
    toasts.push({ severity: 'success', text: 'two' })

    toasts.dismiss(toasts.visible.value[0]?.key ?? 0)

    expect(shown(toasts)).toEqual(['two'])
  })
})

describe('more toasts than there is room for', () => {
  it('show four and keep the rest waiting, each taking its turn and its own time when a place is free', () => {
    const { toasts, clock } = queue()
    for (let i = 1; i <= 6; i += 1) {
      toasts.push({ severity: 'success', text: `t${i}` })
    }
    expect(shown(toasts)).toEqual(['t1', 't2', 't3', 't4'])
    expect(toasts.waiting.value).toBe(2)
    expect(MAX_VISIBLE).toBe(4)

    toasts.dismiss(toasts.visible.value[0]?.key ?? 0)
    expect(shown(toasts)).toEqual(['t2', 't3', 't4', 't5'])
    clock.advance(SHOW_MS - 1)
    expect(shown(toasts)).toContain('t5')
    clock.advance(1)

    expect(shown(toasts)).toEqual(['t6'])
    clock.advance(SHOW_MS)
    expect(shown(toasts)).toEqual([])
    expect(toasts.waiting.value).toBe(0)
  })
})

describe('the same event twice', () => {
  it('is one toast with a count when it comes again within two seconds', () => {
    const { toasts, clock } = queue()

    toasts.push({ severity: 'warning', text: 'PreArm: Compass not calibrated' })
    clock.advance(DEDUPE_MS - 1)
    toasts.push({ severity: 'warning', text: 'PreArm: Compass not calibrated' })

    expect(toasts.visible.value).toHaveLength(1)
    expect(toasts.visible.value[0]?.count).toBe(2)
  })

  it('gives the key of the toast it made or counted on, so that it can be dismissed', () => {
    const { toasts } = queue()

    const first = toasts.push({ severity: 'warning', text: 'Same' })
    const again = toasts.push({ severity: 'warning', text: 'Same' })
    toasts.dismiss(first)

    expect(again).toBe(first)
    expect(toasts.visible.value).toHaveLength(0)
  })
})

describe('the same event, later or otherwise', () => {
  it('is a new toast when it comes later, or with another severity, or another id', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'warning', text: 'a' })
    clock.advance(DEDUPE_MS)
    toasts.push({ severity: 'warning', text: 'a' })
    toasts.push({ severity: 'error', text: 'a' })
    toasts.push({ severity: 'error', text: 'a', id: 'other' })

    expect(toasts.visible.value.map(t => t.count)).toEqual([1, 1, 1, 1])
  })
})

describe('the same event, counted on the newest', () => {
  it('counts a repeat on the newest toast of its kind, not on an older one that is out of the window', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'warning', text: 'a' })
    clock.advance(3000)
    toasts.push({ severity: 'warning', text: 'a' })
    clock.advance(1000)
    toasts.push({ severity: 'warning', text: 'a' })

    expect(toasts.visible.value.map(t => t.count)).toEqual([1, 2])
  })
})

describe('the same event, kept on screen', () => {
  it('starts its time again, so that a message that keeps coming does not go while it does', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'warning', text: 'a' })
    clock.advance(SHOW_MS - 100)
    toasts.push({ severity: 'warning', text: 'a' })

    clock.advance(SHOW_MS - 100)

    expect(shown(toasts)).toEqual(['a'])
  })
})

describe('a toast that is held', () => {
  it('does not run out while it is held, and has the time it had left after', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'success', text: 'one' })
    const key = toasts.visible.value[0]?.key ?? 0
    clock.advance(SHOW_MS - 1000)

    toasts.pause(key, 'pointer')
    clock.advance(10 * SHOW_MS)
    expect(shown(toasts)).toEqual(['one'])
    toasts.resume(key, 'pointer')
    clock.advance(999)
    expect(shown(toasts)).toEqual(['one'])
    clock.advance(1)

    expect(shown(toasts)).toEqual([])
  })
})

describe('a toast that is held by both the pointer and the focus', () => {
  it('stays held by the focus when the pointer leaves, and by the pointer when the focus leaves', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'success', text: 'one' })
    const key = toasts.visible.value[0]?.key ?? 0
    toasts.pause(key, 'pointer')
    toasts.pause(key, 'focus')

    toasts.resume(key, 'pointer')
    clock.advance(10 * SHOW_MS)
    expect(shown(toasts)).toEqual(['one'])
    toasts.pause(key, 'pointer')
    toasts.resume(key, 'focus')
    clock.advance(10 * SHOW_MS)
    expect(shown(toasts)).toEqual(['one'])
    toasts.resume(key, 'pointer')
    clock.advance(SHOW_MS)

    expect(shown(toasts)).toEqual([])
  })
})

describe('a toast with a bar that is updated', () => {
  it('stays as long as it is sticky, and goes after its time once it is not', () => {
    const { toasts, clock } = queue()
    const key = toasts.push({ severity: 'success', text: 'Downloading', sticky: true, progress: { value: 0, max: 10 } })

    clock.advance(10 * ERROR_SHOW_MS)
    expect(shown(toasts)).toEqual(['Downloading'])
    toasts.update(key, { progress: { value: 5, max: 10, label: '50 %' } })
    expect(toasts.visible.value[0]?.progress).toEqual({ value: 5, max: 10, label: '50 %' })
    toasts.update(key, { text: 'Done', sticky: false, progress: null })
    expect(toasts.visible.value[0]?.progress).toBeNull()
    clock.advance(SHOW_MS - 1)
    expect(shown(toasts)).toEqual(['Done'])
    clock.advance(1)

    expect(shown(toasts)).toEqual([])
  })
})

describe('a toast that is updated after it is gone, or that becomes sticky', () => {
  it('does nothing for a toast that is gone', () => {
    const { toasts } = queue()
    const key = toasts.push({ severity: 'success', text: 'one' })
    toasts.dismiss(key)

    expect(() => toasts.update(key, { text: 'two' })).not.toThrow()
    expect(shown(toasts)).toEqual([])
  })

  it('can become sticky again (its time stops)', () => {
    const { toasts, clock } = queue()
    const key = toasts.push({ severity: 'success', text: 'one' })
    clock.advance(SHOW_MS - 1)
    toasts.update(key, { sticky: true })
    clock.advance(10 * SHOW_MS)

    expect(shown(toasts)).toEqual(['one'])
  })
})

describe('a brief toast', () => {
  it('goes after its short time, which is no cancel, and takes no place of the others', () => {
    const { toasts, clock } = queue()
    for (let i = 1; i <= MAX_VISIBLE; i++) {
      toasts.push({ severity: 'warning', text: `w${i}`, sticky: true })
    }
    const reasons: string[] = []
    const key = toasts.push({ severity: 'info', text: 'working', sticky: true, onDismiss: reason => reasons.push(reason) })
    // It waits with the others while the places are taken; a brief word is shown at once, besides them.
    expect(shown(toasts)).toHaveLength(MAX_VISIBLE)
    toasts.update(key, { text: 'done', brief: true, sticky: false, onDismiss: null })
    expect(shown(toasts)).toEqual(['w1', 'w2', 'w3', 'w4', 'done'])
    expect(toasts.waiting.value).toBe(0)
    clock.advance(BRIEF_MS - 1)
    expect(shown(toasts)).toContain('done')
    clock.advance(1)

    expect(shown(toasts)).toEqual(['w1', 'w2', 'w3', 'w4'])
    expect(reasons).toEqual([])
  })
})

describe('what a toast says when it goes', () => {
  it('is told why: the user closed it, its time ran out, or the program took it away', () => {
    const { toasts, clock } = queue()
    const reasons: string[] = []
    const onDismiss = (reason: string) => reasons.push(reason)
    toasts.push({ severity: 'success', text: 'timed', onDismiss })
    const manual = toasts.push({ severity: 'success', text: 'manual', sticky: true, onDismiss })
    const program = toasts.push({ severity: 'success', text: 'program', sticky: true, onDismiss })

    clock.advance(SHOW_MS)
    toasts.dismiss(manual, 'manual')
    toasts.dismiss(program)

    expect(reasons).toEqual(['timeout', 'manual', 'program'])
  })

  it('is not told again for a toast whose callback was taken away', () => {
    const { toasts } = queue()
    const reasons: string[] = []
    const key = toasts.push({ severity: 'success', text: 'one', sticky: true, onDismiss: reason => reasons.push(reason) })
    toasts.update(key, { onDismiss: null })
    toasts.dismiss(key, 'manual')

    expect(reasons).toEqual([])
  })
})

describe('a toast that is held while another goes', () => {
  it('stays held when another toast goes', () => {
    const { toasts, clock } = queue()
    toasts.push({ severity: 'success', text: 'one' })
    toasts.push({ severity: 'success', text: 'two' })
    const [one, two] = toasts.visible.value.map(t => t.key)
    toasts.pause(one ?? 0, 'pointer')

    toasts.dismiss(two ?? 0)
    clock.advance(10 * SHOW_MS)

    expect(shown(toasts)).toEqual(['one'])
  })
})
