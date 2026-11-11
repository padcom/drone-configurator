import { describe, expect, it } from 'vitest'
import { translate } from '@/testing/testing'
import { downloadLine } from './downloadLine'

describe('the line about how a download came', () => {
  it('says nothing before a download, or for a backend that does not say how it came', () => {
    expect(downloadLine(null, 10, translate)).toBeNull()
    expect(downloadLine({}, 10, translate)).toBeNull()
    expect(downloadLine({ source: 'list' }, 10, translate)).toBeNull()
  })

  it('says the file transfer and the time, in seconds with one decimal', () => {
    expect(downloadLine({ source: 'ftp', elapsedMs: 800 }, 1370, translate)).toBe('Parameters: 1370 · by file transfer in 0.8 s')
  })

  it('says the list, and why it was not the file transfer', () => {
    expect(downloadLine({ source: 'list', elapsedMs: 6200, fallback: 'unsupported' }, 1370, translate))
      .toBe('Parameters: 1370 · by list in 6.2 s (file transfer is not used: the vehicle does not offer it)')
    expect(downloadLine({ source: 'list', elapsedMs: 1000, fallback: 'timeout' }, 12, translate))
      .toBe('Parameters: 12 · by list in 1.0 s (file transfer is not used: it did not answer)')
  })

  it('says the plain line for a list with no reason, and for a reason it has no words for', () => {
    expect(downloadLine({ source: 'list', elapsedMs: 2500 }, 5, translate)).toBe('Parameters: 5 · by list in 2.5 s')
    expect(downloadLine({ source: 'list', elapsedMs: 2500, fallback: 'something-new' }, 5, translate))
      .toBe('Parameters: 5 · by list in 2.5 s')
  })
})
