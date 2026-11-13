// A change of what to remove (the retention, the cap) in Settings does not remove anything by itself. A select is changed a value
// at a time (arrowing, the wheel), and a removal is for good: so the change is looked at when the user has stopped, the
// housekeeping is asked what it WOULD remove (a dry run), and when that is something, ONE question names the number and the size
// of the logs; only a yes removes them. A no puts the setting back to what it was. A change that would remove nothing is simply
// kept. While a question is open further changes wait for the answer, and are looked at after it.
import type { LogsHousekept } from '@/generated/app'
import { say } from '@/i18n/say'
import { sizeText } from '@/lib/logs/vehicleLogs'
import type { HousekeepingModel } from './useHousekeeping'
import { numberOf } from './useHousekeeping'

/** The two preferences that remove something. */
export interface Removal {
  /** Days (0 = never). */
  retentionDays: number
  /** Megabytes (0 = no limit). */
  sizeCapMb: number
}

/** What the guard needs. */
export interface GuardDeps {
  /** The housekeeping (asked for a dry run, and then for the real one). */
  housekeeping: HousekeepingModel
  /** What is chosen now. */
  prefs: () => Removal
  /** Asks the user one question; true for yes. */
  confirm: (question: string) => Promise<boolean>
  /** Puts the settings back to a choice. */
  restore: (to: Removal) => Promise<void>
  /** How long (ms) the choice must stay as it is before it is looked at (default 600). */
  settleMs?: number
}

/** The guard: tell it when the choice changed, and when the settings have been read. */
export interface Guard {
  /** The settings have been read: what is chosen now is what is accepted. */
  begin: () => void
  /** The choice may have changed. */
  changed: () => void
}

/**
 * Whether two choices are the same.
 *
 * @param a one
 * @param b the other
 * @returns true when they are
 */
function same(a: Removal, b: Removal): boolean {
  return a.retentionDays === b.retentionDays && a.sizeCapMb === b.sizeCapMb
}

/**
 * The question before logs are removed by a changed setting: how many, how big, which, and what happens on a no.
 *
 * @param preview what a real run would remove
 * @returns the question
 */
export function questionOf(preview: LogsHousekept): string {
  const write = (value: number, digits: number) => value.toLocaleString(undefined, { maximumFractionDigits: digits })
  const names = preview.removed.slice(0, 5).map(log => numberOf(log.name)).join(', ')

  return say('housekeeping.ask', { count: preview.removedCount, size: sizeText(Number(preview.freed), write), names })
}

/** The guard of the changes of what to remove. */
class RemovalGuard implements Guard {
  private accepted: Removal | null = null
  private asking = false
  private again = false
  private timer: ReturnType<typeof setTimeout> | undefined

  /**
   * Makes the guard.
   *
   * @param deps the housekeeping, the choice, the question and the way to put the choice back
   */
  constructor(private readonly deps: GuardDeps) {}

  begin(): void {
    this.accepted = this.deps.prefs()
  }

  changed(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.look(), this.deps.settleMs ?? 600)
  }

  /** Looks at what is chosen, once the user has stopped: nothing is removed without the answer. */
  private async look(): Promise<void> {
    if (this.accepted === null) {
      return
    }
    if (this.asking) {
      this.again = true

      return
    }
    this.asking = true

    try {
      await this.judge(this.accepted, this.deps.prefs())
    } finally {
      this.asking = false

      if (this.again) {
        this.again = false
        this.changed()
      }
    }
  }

  /**
   * Decides about a choice that is not the accepted one: kept if it would remove nothing, asked about if it would.
   *
   * @param before what was accepted
   * @param now what is chosen
   */
  private async judge(before: Removal, now: Removal): Promise<void> {
    if (same(before, now)) {
      return
    }
    const preview = await this.deps.housekeeping.preview(now)
    if (preview === null || preview.removedCount === 0) {
      this.accepted = now
    } else {
      await this.ask(preview, before, now)
    }
  }

  /**
   * Asks the one question: removes on a yes, puts the setting back on a no.
   *
   * @param preview what a real run would remove
   * @param before what was accepted
   * @param now what is chosen
   */
  private async ask(preview: LogsHousekept, before: Removal, now: Removal): Promise<void> {
    if (await this.deps.confirm(questionOf(preview))) {
      this.accepted = now
      await this.deps.housekeeping.run()
    } else {
      await this.deps.restore(before)
    }
  }
}

/**
 * The guard of the changes of what to remove.
 *
 * @param deps the housekeeping, the choice, the question and the way to put the choice back
 * @returns the guard
 */
export function useHousekeepingGuard(deps: GuardDeps): Guard {
  return new RemovalGuard(deps)
}
