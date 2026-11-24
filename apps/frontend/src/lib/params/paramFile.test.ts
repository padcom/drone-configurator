// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { type ParamFileFormat, PARAM_FILE_FORMATS, formatParamFile, linesOf, looksLikeJson } from './paramFile'
import { parseParamFile, parseValue } from './paramFile'

/** The sample files: written for these tests, following the formats (samples/ is kept byte for byte, see .gitattributes). */
const SAMPLES = fileURLToPath(new URL('samples', import.meta.url))

/**
 * A sample file of the tests (samples/), byte for byte.
 *
 * @param name its name
 * @returns its text
 */
const sample = (name: string) => readFileSync(join(SAMPLES, name), 'utf8')

/**
 * The names and values a file holds.
 *
 * @param text the file's text
 * @returns [name, value] pairs, in the file's order
 */
const pairs = (text: string) => parseParamFile(text).entries.map(entry => [entry.id, entry.value])

/**
 * The names and values of entries, sorted by name (as a file is written).
 *
 * @param entries the entries
 * @returns [name, value] pairs
 */
const byId = (entries: { id: string, value: number }[]) => entries.map(entry => [entry.id, entry.value]).sort()

/** Parameters as the vehicle reports them: its REAL32s are floats (0.1 comes back as 0.10000000149011612). */
const FLOATS: Param[] = [
  { id: 'ATC_RAT_PIT_P', index: 0, kind: 'real', type: 'REAL32', value: Math.fround(0.135) },
  { id: 'ATC_RAT_PIT_D', index: 1, kind: 'real', type: 'REAL32', value: Math.fround(0.0036) },
  { id: 'INS_ACCOFFS_X', index: 2, kind: 'real', type: 'REAL32', value: Math.fround(-0.0123456789) },
  { id: 'TINY', index: 3, kind: 'real', type: 'REAL32', value: Math.fround(1e-7) },
  { id: 'BIG', index: 4, kind: 'real', type: 'REAL32', value: Math.fround(16777217) },
  { id: 'LOG_BITMASK', index: 5, kind: 'int', type: 'INT32', value: 176126 },
  { id: 'BRD_SERIAL_NUM', index: 6, kind: 'int', type: 'INT32', value: -2147483648 },
  { id: 'NEG_ZERO_OFF', index: 7, kind: 'real', type: 'REAL32', value: 0 },
  { id: 'SERVO1_MIN', index: 8, kind: 'int', type: 'INT16', value: 1000 },
  { id: 'FENCE_ENABLE', index: 9, kind: 'int', type: 'INT8', value: 1 },
  { id: 'SERIAL1_BAUD', index: 10, kind: 'int', type: 'UINT32', value: 4294967295 },
]

it('reads ArduPilot\'s NAME,VALUE with CRLF line ends and a #NOTE comment', () => {
  const file = parseParamFile(sample('frame.param'))

  expect(file.format).toBe('param')
  expect(file.entries).toHaveLength(12)
  expect(file.entries[0]).toEqual({ id: 'ATC_ANG_PIT_P', value: 9, line: 2 })
  expect(file.entries.find(entry => entry.id === 'ATC_RAT_PIT_D')?.value).toBe(0.0025)
  expect(file.duplicates).toEqual([])
  expect(file.malformed).toEqual([])
})

it('reads a hand-aligned defaults file: spaces, tabs, = signs, a comment after the value, hex, @READONLY, an exponent', () => {
  const file = parseParamFile(sample('defaults.parm'))

  expect(file.format).toBe('parm')
  expect(pairs(sample('defaults.parm'))).toEqual([
    ['FRAME_CLASS', 1],
    ['FRAME_TYPE', 1],
    ['BATT_MONITOR', 4],
    ['SERVO1_FUNCTION', 33],
    ['SERVO2_FUNCTION', 34],
    ['COMPASS_OFS_X', -18],
    ['RC1_MIN', 1000],
    ['LOG_BITMASK', 0x7FFE],
    ['SYSID_MYGCS', 255],
    ['SIM_SPEEDUP', 10],
  ])
  expect(file.entries.find(entry => entry.id === 'SYSID_MYGCS'))
    .toEqual({ id: 'SYSID_MYGCS', value: 255, line: 11, readOnly: true })
  expect(file.entries.find(entry => entry.id === 'BATT_MONITOR')?.line).toBe(4)
  expect(file.malformed).toEqual([])
})

it('reads what MAVProxy\'s param save writes: names padded to 16, floats with six decimals', () => {
  const file = parseParamFile(sample('mavproxy.parm'))

  expect(file.format).toBe('parm')
  expect(pairs(sample('mavproxy.parm'))).toEqual([
    ['ATC_RAT_PIT_P', 0.135], ['BATT_CAPACITY', 5200], ['FENCE_ENABLE', 0], ['RTL_ALT', 1500], ['WPNAV_SPEED', 1000],
  ])
})

it('reads QGroundControl\'s file: ids, the MAV_PARAM_TYPE of each line, and the comment block at the top', () => {
  const file = parseParamFile(sample('vehicle.params'))

  expect(file.format).toBe('qgc')
  expect(file.entries[0]).toEqual({ id: 'ATC_RAT_PIT_P', value: 0.135000005364418, line: 8, sysid: 1, compid: 1, type: 'REAL32' })
  expect(file.entries.map(entry => entry.type)).toEqual(['REAL32', 'INT32', 'INT8', 'INT32', 'INT8'])
  expect(file.entries.at(-1)).toMatchObject({ id: 'MNT1_TYPE', compid: 154 })
})

it('takes LF, CRLF and CR alone, and a byte-order mark', () => {
  expect(linesOf('﻿A,1\r\nB,2\nC,3\rD,4')).toEqual(['A,1', 'B,2', 'C,3', 'D,4'])
  expect(pairs('﻿A,1\r\nB,2\nC,3\rD,4')).toEqual([['A', 1], ['B', 2], ['C', 3], ['D', 4]])
})

it('reports a name given twice with both lines, and keeps the last value, as ArduPilot does', () => {
  const file = parseParamFile('RTL_ALT,1000\nFENCE_ENABLE,1\nRTL_ALT,2000\nRTL_ALT 3000\n')

  expect(file.entries).toEqual([{ id: 'RTL_ALT', value: 3000, line: 4 }, { id: 'FENCE_ENABLE', value: 1, line: 2 }])
  expect(file.duplicates).toEqual([{ id: 'RTL_ALT', lines: [1, 3, 4] }])
})

it('reports each line that is not a parameter with its number, and reads the rest', () => {
  const file = parseParamFile([
    'RTL_ALT,1500',
    'A_NAME_LONGER_THAN_16,1',
    'NO_VALUE',
    'TOO,MANY,WORDS',
    'NOT_A_NUMBER,abc',
    '1BAD_NAME,1',
    'NAN_VALUE,nan',
    'INF_VALUE,inf',
    '@include other.parm',
    'FENCE_ENABLE,1',
  ].join('\n'))

  expect(file.entries.map(entry => entry.id)).toEqual(['RTL_ALT', 'FENCE_ENABLE'])
  expect(file.malformed.map(line => line.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
  expect(file.malformed[0]).toEqual({ line: 2, text: 'A_NAME_LONGER_THAN_16,1' })
})

it('reads a name of exactly 16 characters, ArduPilot\'s longest', () => {
  expect(pairs('SIXTEEN_CHARS_AB,1')).toEqual([['SIXTEEN_CHARS_AB', 1]])
})

it('takes a QGroundControl line with a type MAVLink does not name without a type', () => {
  expect(parseParamFile('1\t1\tRTL_ALT\t1500\t99').entries)
    .toEqual([{ id: 'RTL_ALT', value: 1500, line: 1, sysid: 1, compid: 1 }])
})

it('has no entries for an empty file or one of comments only, and nothing is malformed in it', () => {
  expect(parseParamFile('')).toEqual({ format: 'parm', entries: [], duplicates: [], malformed: [] })
  expect(parseParamFile('# a\r\n#\r\n\r\n')).toEqual({ format: 'parm', entries: [], duplicates: [], malformed: [] })
})

it('reads decimals, exponents, signs and hexadecimal, and nothing else', () => {
  expect(['1', '-0.5', '+.5', '1.', '2.5e-3'].map(parseValue)).toEqual([1, -0.5, 0.5, 1, 0.0025])
  expect(['0x10', '-0x10', '0XfF'].map(parseValue)).toEqual([16, -16, 255])
  expect(['abc', '1,5', 'nan', 'inf', '1e999', ''].map(parseValue)).toEqual([null, null, null, null, null, null])
})

it('writes NAME,VALUE sorted by name, the shortest text of each float, LF line ends, and a comment at the top', () => {
  const text = formatParamFile(FLOATS, 'param', { vehicle: { ...VEHICLE }, now: new Date('2026-11-24T10:00:00Z') })

  expect(text.split('\n')).toEqual([
    '# Parameters of QUADROTOR (ARDUPILOTMEGA), vehicle 1, saved by Drone Configurator on 2026-11-24T10:00:00.000Z',
    'ATC_RAT_PIT_D,0.0036',
    'ATC_RAT_PIT_P,0.135',
    'BIG,16777216',
    'BRD_SERIAL_NUM,-2147483648',
    'FENCE_ENABLE,1',
    'INS_ACCOFFS_X,-0.012345679',
    'LOG_BITMASK,176126',
    'NEG_ZERO_OFF,0',
    'SERIAL1_BAUD,4294967295',
    'SERVO1_MIN,1000',
    'TINY,1e-7',
    '',
  ])
  expect(text).not.toContain('\r')
})

it('writes MAVProxy\'s layout: the name padded to 16 columns and a space', () => {
  const text = formatParamFile(FLOATS.slice(0, 2), 'parm', { now: new Date('2026-11-24T10:00:00Z') })

  expect(text).toBe([
    '# Parameters of a vehicle, saved by Drone Configurator on 2026-11-24T10:00:00.000Z',
    'ATC_RAT_PIT_D    0.0036',
    'ATC_RAT_PIT_P    0.135',
    '',
  ].join('\n'))
})

it('writes QGroundControl\'s layout: the vehicle\'s ids, tabs, and the MAV_PARAM_TYPE of each', () => {
  const text = formatParamFile(FLOATS, 'qgc', { vehicle: { ...VEHICLE, sysid: 7, compid: 1 } })
  const lines = text.trimEnd().split('\n').filter(line => !line.startsWith('#'))

  expect(text).toContain('\n# Vehicle-Id Component-Id Name Value Type\n')
  expect(lines.slice(0, 3)).toEqual(['7\t1\tATC_RAT_PIT_D\t0.0036\t9', '7\t1\tATC_RAT_PIT_P\t0.135\t9', '7\t1\tBIG\t16777216\t9'])
  expect(lines.find(line => line.includes('FENCE_ENABLE'))).toBe('7\t1\tFENCE_ENABLE\t1\t2')
  expect(lines.find(line => line.includes('SERVO1_MIN'))).toBe('7\t1\tSERVO1_MIN\t1000\t4')
  expect(lines.find(line => line.includes('SERIAL1_BAUD'))).toBe('7\t1\tSERIAL1_BAUD\t4294967295\t5')
})

it('gives a type the table does not know the number of INT32 or REAL32, by its kind', () => {
  const odd: Param[] = [
    { id: 'A', index: 0, kind: 'int', type: 'ODD', value: 1 },
    { id: 'B', index: 1, kind: 'real', type: 'ODD', value: 1.5 },
  ]

  expect(formatParamFile(odd, 'qgc').trimEnd().split('\n').slice(-2)).toEqual(['1\t1\tA\t1\t6', '1\t1\tB\t1.5\t9'])
})

/**
 * The value a file read back holds for a parameter, as the vehicle would hold it (a REAL32 as its float).
 *
 * @param entries what the file holds
 * @param param the parameter
 * @returns the value, or NaN when the file lacks it
 */
function readBack(entries: { id: string, value: number }[], param: Param): number {
  const read = entries.find(entry => entry.id === param.id)?.value ?? Number.NaN

  return param.kind === 'real' ? Math.fround(read) : read
}

it.each(PARAM_FILE_FORMATS)('give back every value the vehicle holds, bit for bit, as %s', (format: ParamFileFormat) => {
  const file = parseParamFile(formatParamFile(FLOATS, format, { vehicle: { ...VEHICLE } }))

  expect(file.format).toBe(format)
  expect(file.malformed).toEqual([])
  // A REAL32 comes back as the same float; an integer as the same integer.
  expect(FLOATS.map(param => readBack(file.entries, param))).toEqual(FLOATS.map(param => param.value))
})

it.each(PARAM_FILE_FORMATS)('give back the mock vehicle\'s list in the %s format', (format: ParamFileFormat) => {
  expect(pairs(formatParamFile(PARAMS, format)).sort()).toEqual(PARAMS.map(param => [param.id, param.value]).sort())
})

it('read the sample files and write them again with the same names and values', () => {
  for (const name of ['frame.param', 'defaults.parm', 'mavproxy.parm', 'vehicle.params']) {
    const read = parseParamFile(sample(name)).entries
    const params = read.map((entry, index): Param => ({ id: entry.id, index, kind: 'real', type: 'REAL64', value: entry.value }))

    expect(pairs(formatParamFile(params, 'param')).sort(), name).toEqual(read.map(entry => [entry.id, entry.value]).sort())
  }
})

it('takes a text that starts with { (after white space or a byte-order mark) for JSON', () => {
  expect(looksLikeJson('{"format":1}')).toBe(true)
  expect(looksLikeJson('﻿\r\n  {')).toBe(true)
  expect(looksLikeJson('RTL_ALT,1')).toBe(false)
  expect(looksLikeJson('# {')).toBe(false)
})

/**
 * Whether ArduPilot leaves a line of a parameter file out: a name and no value, or a name over 16 characters.
 *
 * @param text the line
 * @returns true if it does
 */
function leftOutByArduPilot(text: string): boolean {
  const [name = '', value] = text.split(/[\s,=]+/u)

  return value === undefined || name.length > 16
}

/** ArduPilot's own parameter files (Tools/autotest/default_params, which the SITL build copies), when SITL is here. */
const REAL_FILES = process.env.SITL_DIR ? join(process.env.SITL_DIR, 'default_params') : ''

const noRealFiles = !REAL_FILES || !existsSync(REAL_FILES)

it.skipIf(noRealFiles)('reads ArduPilot\'s own files, every line accounted for, and writes them again', () => {
  const names = readdirSync(REAL_FILES).filter(name => /\.(?:parm|param)$/u.test(name))
  const malformed: string[] = []

  for (const name of names) {
    const text = readFileSync(join(REAL_FILES, name), 'utf8')
    const file = parseParamFile(text)
    const params = file.entries.map((entry, index): Param => ({ ...entry, index, kind: 'real', type: 'REAL64' }))
    const lines = linesOf(text).filter(line => line.split('#')[0]?.trim())
    const read = file.entries.length + file.duplicates.reduce((sum, { lines: on }) => sum + on.length - 1, 0)

    // Each line that is not a comment is a parameter, or reported: none is dropped in silence.
    expect(read + file.malformed.length, name).toBe(lines.length)
    expect(pairs(formatParamFile(params, 'parm')), name).toEqual(byId(file.entries))
    malformed.push(...file.malformed.map(line => `${name}:${line.line}: ${line.text}`))
  }
  expect(names.length).toBeGreaterThan(10)
  // What is reported is what ArduPilot leaves out too (AP_Param::parse_param_line): a name and no value (motorboat.parm's
  // "SIM_TIDE_0.5"), or a name longer than its 16 characters.
  expect(malformed.filter(line => !leftOutByArduPilot(line.split(': ')[1] ?? '')), malformed.join('\n')).toEqual([])
})
