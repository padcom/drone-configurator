import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { csvRows, gpxPoints, isPlace, kmlPoints, savedFile } from './exported'

it('reads a CSV of numbers into rows of cells', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exported-'))
  writeFileSync(join(dir, 'a-ATT.csv'), 'TimeUS,Roll (deg)\r\n1,2.5\r\n3,\r\n')

  expect(csvRows(savedFile(dir, '-ATT.csv') ?? '')).toEqual([['TimeUS', 'Roll (deg)'], ['1', '2.5'], ['3', '']])
  expect(savedFile(dir, '.gpx')).toBeUndefined()
})

it('reads the points of a GPX by their tags', () => {
  const gpx = '<trkseg>\n<trkpt lat="47.5" lon="8.5"><ele>1</ele></trkpt>\n<trkpt lat="-1.25" lon="-0.5"></trkpt>\n</trkseg>'

  expect(gpxPoints(gpx)).toEqual([{ lat: 47.5, lon: 8.5 }, { lat: -1.25, lon: -0.5 }])
})

it('reads the points of a KML line as longitude then latitude', () => {
  const kml = '<coordinates>8.5,47.5 -0.5,-1.25 </coordinates>'

  expect(kmlPoints(kml)).toEqual([{ lat: 47.5, lon: 8.5 }, { lat: -1.25, lon: -0.5 }])
  expect(kmlPoints('<coordinates></coordinates>')).toEqual([])
})

it('knows a place on the globe from the null island and from numbers outside it', () => {
  expect(isPlace({ lat: 47.5, lon: 8.5 })).toBe(true)
  expect(isPlace({ lat: 0, lon: 0 })).toBe(false)
  expect(isPlace({ lat: 91, lon: 0 })).toBe(false)
  expect(isPlace({ lat: 0, lon: -181 })).toBe(false)
})
