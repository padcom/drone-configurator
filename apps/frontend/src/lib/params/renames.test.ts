import { expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { RENAME_GROUPS } from './renameTable'
import {
  type Rename,
  type RenameContext,
  atLeast,
  convertValue,
  familyOf,
  loadRenames,
  renameContext,
  renameFor,
  renameTable,
  renameWanted,
  skipChecks,
} from './renames'

const TABLE = renameTable(RENAME_GROUPS)

/**
 * A parameter of the vehicle.
 *
 * @param id its name
 * @param value its value
 * @returns the parameter
 */
const param = (id: string, value = 0): Param => ({ id, index: 0, kind: 'real', type: 'REAL32', value })

/**
 * The first rename of an old name.
 *
 * @param from the old name
 * @returns the rename
 */
function first(from: string): Rename {
  const [rename] = TABLE.get(from) ?? []
  if (!rename) {
    throw new Error(`no rename of ${from}`)
  }

  return rename
}

/**
 * Checks a rename: two names of ArduPilot's form, a source, vehicles, and units only where the value is scaled with the name.
 *
 * @param rename the rename
 */
function expectWellFormed(rename: Rename): void {
  expect(rename.from).not.toBe(rename.to)
  expect([rename.from, rename.to].every(name => /^[A-Z][A-Z0-9_]{1,15}$/u.test(name))).toBe(true)
  expect(rename.source).toMatch(/^[\w/]+\.cpp:\d+ \((?:(?:Copter|Plane)-4\.\d\.\d|master [0-9a-f]{7})\)$/u)
  expect(rename.vehicles.length).toBeGreaterThan(0)
  expect(rename.units === undefined || rename.scale !== 1).toBe(true)
}

/** A Copter of 4.7.2. */
const COPTER_47: RenameContext = renameContext(TABLE, 'copter', '4.7.2')

it('holds ArduPilot\'s renames of 4.5 to 4.8, each once for a vehicle, with where the firmware converts it', () => {
  const all = [...TABLE.values()].flat()

  expect(all.length).toBeGreaterThanOrEqual(200)
  expect(new Set(all.map(rename => rename.since))).toEqual(new Set(['4.5', '4.6', '4.7', '4.8']))
  all.forEach(expectWellFormed)

  // An old name goes to one new name on each kind of vehicle.
  for (const family of ['copter', 'plane', 'rover'] as const) {
    const pairs = all.filter(rename => rename.vehicles.includes(family)).map(rename => rename.from)
    expect(new Set(pairs).size).toBe(pairs.length)
  }
})

it('has the renames the issue names, with their scales and units', () => {
  expect(TABLE.get('RTL_ALT')).toEqual([expect.objectContaining({
    to: 'RTL_ALT_M', since: '4.7', vehicles: ['copter'], scale: 0.01, units: { from: 'cm', to: 'm' },
    source: 'ArduCopter/mode_rtl.cpp:65 (Copter-4.7.3)',
  })])
  expect(first('ALT_HOLD_RTL')).toMatchObject({ to: 'RTL_ALTITUDE', since: '4.5', vehicles: ['plane'], scale: 0.01 })
  expect(first('WPNAV_SPEED')).toMatchObject({ to: 'WP_SPD', scale: 0.01, units: { from: 'cm/s', to: 'm/s' } })
  expect(TABLE.get('SYSID_THISMAV')?.map(rename => rename.vehicles)).toEqual([['copter'], ['plane'], ['rover']])
  expect(first('ARMING_CHECK')).toMatchObject({ to: 'ARMING_SKIPCHK', convert: 'skipChecks', scale: 1 })
  expect(first('GPS_POS1_X')).toMatchObject({ to: 'GPS1_POS_X', since: '4.6' })
  expect(first('PSC_ACCZ_IMAX')).toMatchObject({ to: 'PSC_D_ACC_IMAX', scale: 0.001 })
})

it('loads the table once, as a chunk of its own', async () => {
  const loaded = await loadRenames()

  expect(loaded.get('RTL_ALT')?.[0]?.to).toBe('RTL_ALT_M')
  expect(await loadRenames()).toBe(loaded)
})

it('renames a name only when the vehicle has the new one and not the old one', () => {
  const names = new Set(['RTL_ALT_M', 'WP_SPD', 'WPNAV_SPEED'])

  expect(renameFor('RTL_ALT', names, COPTER_47)?.to).toBe('RTL_ALT_M')
  // The vehicle still has the old name: it is that parameter.
  expect(renameFor('WPNAV_SPEED', names, COPTER_47)).toBeUndefined()
  // The vehicle has neither: not on this vehicle.
  expect(renameFor('RTL_SPEED', names, COPTER_47)).toBeUndefined()
  expect(renameFor('NOT_RENAMED', names, COPTER_47)).toBeUndefined()
})

it('renames only for the kind of vehicle and the release the firmware renames it in, when they are known', () => {
  const names = new Set(['RTL_ALT_M', 'RTL_ALTITUDE'])

  expect(renameFor('RTL_ALT', names, renameContext(TABLE, 'plane', '4.7.2'))).toBeUndefined()
  expect(renameFor('ALT_HOLD_RTL', names, renameContext(TABLE, 'plane', '4.6.3'))?.to).toBe('RTL_ALTITUDE')
  expect(renameFor('RTL_ALT', names, renameContext(TABLE, 'copter', '4.6.3'))).toBeUndefined()
  expect(renameFor('RTL_ALT', names, renameContext(TABLE, 'copter', '4.8.0-dev'))?.to).toBe('RTL_ALT_M')
  // Not known: the vehicle's names decide.
  expect(renameFor('RTL_ALT', names, renameContext(TABLE))?.to).toBe('RTL_ALT_M')
})

it('reads a firmware version against a release', () => {
  expect(atLeast('4.7.2', '4.7')).toBe(true)
  expect(atLeast('4.7.0-beta1', '4.7')).toBe(true)
  expect(atLeast('4.6.3', '4.7')).toBe(false)
  expect(atLeast('5.0.0', '4.8')).toBe(true)
  expect(atLeast('3.9.9', '4.5')).toBe(false)
  expect(atLeast('unknown', '4.7')).toBe(true)
})

it('says the kind of vehicle of a vehicle type', () => {
  expect(familyOf('QUADROTOR')).toBe('copter')
  expect(familyOf('HELICOPTER')).toBe('copter')
  expect(familyOf('FIXED_WING')).toBe('plane')
  expect(familyOf('VTOL_TILTROTOR')).toBe('plane')
  expect(familyOf('GROUND_ROVER')).toBe('rover')
  expect(familyOf('SUBMARINE')).toBeUndefined()
  expect(familyOf(undefined)).toBeUndefined()
})

it('converts a value as the firmware does: scaled exactly, or checks to run turned into checks to skip', () => {
  const [rtl, accz, imax, type] = [first('RTL_ALT'), first('PSC_ACCZ_P'), first('PSC_ACCZ_IMAX'), first('GPS_TYPE')]

  expect(convertValue(rtl, 3000)).toBe(30)
  expect(convertValue(rtl, 1550)).toBe(15.5)
  expect(convertValue(accz, 0.5)).toBe(0.05)
  expect(convertValue(imax, 800)).toBe(0.8)
  expect(convertValue(type, 1)).toBe(1)
  // ARMING_CHECK: all (1) skips none, none (0) skips all, else the checks not run are skipped (bits 1 to 20).
  expect(skipChecks(1)).toBe(0)
  expect(skipChecks(0)).toBe(-1)
  expect(skipChecks(0b110)).toBe(0x1F_FF_F8)
  expect(skipChecks(0x1F_FF_FE)).toBe(0)
})

it('puts the wanted values under the vehicle\'s names, converted, and says where each came from', () => {
  const params = [param('RTL_ALT_M', 15), param('WP_SPD', 10), param('ARMING_SKIPCHK'), param('BATT_CAPACITY')]
  const wanted = [
    { id: 'RTL_ALT', value: 3000, kind: 'int', type: 'INT32' },
    { id: 'WPNAV_SPEED', value: 750, problem: 'for another component' },
    { id: 'ARMING_CHECK', value: 1 },
    { id: 'BATT_CAPACITY', value: 5200 },
    { id: 'RTL_SPEED', value: 500 },
  ]

  expect(renameWanted(wanted, params, COPTER_47)).toEqual([
    // The old type is not the new one's: it is left out, and the value is checked against the vehicle's type.
    { id: 'RTL_ALT_M', value: 30, renamed: { from: 'RTL_ALT', since: '4.7', value: 3000, units: { from: 'cm', to: 'm' } } },
    {
      id: 'WP_SPD', value: 7.5, problem: 'for another component',
      renamed: { from: 'WPNAV_SPEED', since: '4.7', value: 750, units: { from: 'cm/s', to: 'm/s' } },
    },
    { id: 'ARMING_SKIPCHK', value: 0, renamed: { from: 'ARMING_CHECK', since: '4.7', value: 1 } },
    { id: 'BATT_CAPACITY', value: 5200 },
    { id: 'RTL_SPEED', value: 500 },
  ])
})

it('leaves an old name alone when the file has the new name too: the new one counts', () => {
  const params = [param('RTL_ALT_M', 15)]
  const wanted = [{ id: 'RTL_ALT', value: 3000 }, { id: 'RTL_ALT_M', value: 25 }]

  expect(renameWanted(wanted, params, COPTER_47)).toEqual(wanted)
})
