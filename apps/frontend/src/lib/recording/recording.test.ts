// What the page makes of the recording's state and of a recording in the library (#30).
import { expect, it } from 'vitest'
import type { LocalLog } from '@/generated/app'
import { originOf, recordedStateKey, startedText } from './recordedLog'
import { failureKey, isRecordedKey, recordingPhase } from './recordingPrefs'

const STATE = { enabled: true, folder: '/r', limitMb: 2000, bytes: 0, removed: 0, removedBytes: 0 }

const LOG: LocalLog = {
  key: 'recorded/2026-11-24_10-15-30.tlog', vehicle: 'recorded', id: 0, size: 10, modified: 1, crc: '', source: 'tlog',
}

it('tells what the recording is doing in one word', () => {
  expect(recordingPhase(null)).toBe('idle')
  expect(recordingPhase(STATE)).toBe('idle')
  expect(recordingPhase({ ...STATE, key: 'recorded/x.tlog' })).toBe('recording')
  expect(recordingPhase({ ...STATE, enabled: false })).toBe('off')
  expect(recordingPhase({ ...STATE, failure: { code: 'disk-full', message: 'full' } })).toBe('failed')
  expect(failureKey({ code: 'write-failed', message: '' })).toBe('recording.failure.write-failed')
})

it('tells a recording this app made from an imported one and from a vehicle log', () => {
  expect(originOf({ ...LOG, started: 1 })).toBe('recorded')
  expect(originOf(LOG)).toBe('imported')
  expect(originOf({ ...LOG, source: 'dataflash' })).toBe('vehicle')
  expect(isRecordedKey(LOG.key)).toBe(true)
  expect(isRecordedKey('imported/00000001-deadbeef.tlog')).toBe(false)
  expect(startedText({ ...LOG, started: Date.UTC(2026, 10, 24, 10, 15, 30) }, 'en')).toContain('2026')
})

it('says a recording is being made, ended or not ended', () => {
  const summary = { messages: 1, problems: 0, verified: true, modeChanges: 0 }
  expect(recordedStateKey({ ...LOG, started: 1, live: true })).toBe('logs.flights.stateRecording')
  expect(recordedStateKey({ ...LOG, started: 1 })).toBeNull()
  expect(recordedStateKey({ ...LOG, started: 1, summary })).toBe('logs.flights.stateRecorded')
  const unfinished = { ...LOG, started: 1, summary: { ...summary, verified: false } }
  expect(recordedStateKey(unfinished)).toBe('logs.flights.stateRecordedUnfinished')
})
