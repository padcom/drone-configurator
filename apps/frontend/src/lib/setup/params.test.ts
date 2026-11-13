import { expect, it } from 'vitest'
import { decodeDeviceId, deviceRows, hexOf } from './deviceId'
import { FRAME_CLASSES, FRAME_TYPES, ORIENTATIONS, layoutOf, nameIn, optionsOf, pointOf } from './frame'
import { BAUDS, PROTOCOLS, idsOf, inUse, mayCutLink, portParams, portsOn } from './serial'

it('names the frame classes, types and orientations of ArduPilot\'s lists, and nothing it does not list', () => {
  expect(nameIn(FRAME_CLASSES, 1)).toBe('Quad')
  expect(nameIn(FRAME_CLASSES, 14)).toBe('Deca')
  expect(nameIn(FRAME_CLASSES, 99)).toBeUndefined()
  expect(nameIn(FRAME_TYPES, 1)).toBe('X')
  expect(nameIn(FRAME_TYPES, 18)).toBe('BetaFlightXReversed')
  expect(nameIn(ORIENTATIONS, 8)).toBe('Roll180')
  expect(nameIn(ORIENTATIONS, 24)).toBe('Pitch90')
  expect(nameIn(ORIENTATIONS, 38)).toBe('Yaw293Pitch68Roll180')
  expect(nameIn(ORIENTATIONS, 40)).toBe('Pitch315Roll90')
  expect(nameIn(ORIENTATIONS, 41)).toBeUndefined()
  expect(nameIn(ORIENTATIONS, 43)).toBe('Roll315')
  expect(nameIn(ORIENTATIONS, 102)).toBe('Custom 2')
})

it('draws the layouts that ArduPilot spells out, motor by motor, and no other', () => {
  const quadX = layoutOf(1, 1)
  expect(quadX?.map(motor => `${motor.number}:${motor.angle}:${motor.spin}`).sort())
    .toEqual(['1:45:ccw', '2:135:cw', '3:-135:ccw', '4:-45:cw'])
  expect(layoutOf(1, 0)?.map(motor => motor.number).sort()).toEqual([1, 2, 3, 4])
  expect(layoutOf(2, 1)).toHaveLength(6)
  expect(layoutOf(3, 0)).toHaveLength(8)
  expect(layoutOf(1, 2)).toBeNull()
  expect(layoutOf(7, 1)).toBeNull()
})

it('turns every motor of a layout so that the spins alternate around the frame', () => {
  for (const [frameClass, frameType] of [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1]] as const) {
    const motors = layoutOf(frameClass, frameType) ?? []
    const cw = motors.filter(motor => motor.spin === 'cw').length

    expect(cw, `${frameClass}:${frameType}`).toBe(motors.length / 2)
  }
})

it('puts the front up and the angle clockwise from it', () => {
  expect(pointOf(0, 60)).toEqual({ x: 0, y: -60 })
  expect(pointOf(90, 60)).toEqual({ x: 60, y: 0 })
  expect(pointOf(180, 60).y).toBe(60)
  expect(pointOf(-90, 60).x).toBe(-60)
})

it('gives the options of a list, with one of the interface\'s own in front when asked', () => {
  expect(optionsOf(FRAME_TYPES.slice(0, 2))).toEqual([{ value: 0, label: 'Plus' }, { value: 1, label: 'X' }])
  expect(optionsOf(FRAME_TYPES.slice(0, 1), { value: -1, label: 'None' })[0]).toEqual({ value: -1, label: 'None' })
})

it('names the serial protocols and speeds of ArduPilot\'s lists', () => {
  expect(nameIn(PROTOCOLS, 2)).toBe('MAVLink2')
  expect(nameIn(PROTOCOLS, 5)).toBe('GPS')
  expect(nameIn(PROTOCOLS, 50)).toBe('IOMCU')
  expect(nameIn(PROTOCOLS, 6)).toBeUndefined()
  expect(nameIn(BAUDS, 57)).toBe('57600')
  expect(nameIn(BAUDS, 1500)).toBe('1.5 Mbaud')
})

it('finds the ports a vehicle has, counts the ones in use, and lists their parameters', () => {
  const have = new Set(['SERIAL0_PROTOCOL', 'SERIAL0_BAUD', 'SERIAL2_PROTOCOL', 'SERIAL2_BAUD', 'SERIAL3_PROTOCOL'])

  expect(portsOn(id => have.has(id))).toEqual([0, 2])
  expect(inUse([2, -1, 5, -1])).toBe(2)
  expect(portParams(3)).toEqual({ protocol: 'SERIAL3_PROTOCOL', baud: 'SERIAL3_BAUD' })
  expect(idsOf([0, 2])).toEqual(['SERIAL0_PROTOCOL', 'SERIAL0_BAUD', 'SERIAL2_PROTOCOL', 'SERIAL2_BAUD'])
})

it('says a change to SERIAL0, or to a port that carries MAVLink, may cut the link', () => {
  expect(mayCutLink(0, -1)).toBe(true)
  expect(mayCutLink(2, 2)).toBe(true)
  expect(mayCutLink(2, 1)).toBe(true)
  expect(mayCutLink(2, 5)).toBe(false)
  expect(mayCutLink(3, -1)).toBe(false)
})

it('decodes a device id into the bus, which bus, the address and the device type', () => {
  // I2C (1), bus 1, address 0x1e, type 7.
  expect(decodeDeviceId(466_441)).toEqual({ bus: 'i2c', instance: 1, address: 0x1E, type: 7 })
  // SPI (2), bus 0, address 1, type 9.
  expect(decodeDeviceId(590_082)).toEqual({ bus: 'spi', instance: 0, address: 1, type: 9 })
  expect(decodeDeviceId(3)?.bus).toBe('dronecan')
  expect(decodeDeviceId(6)?.bus).toBe('serial')
})

it('says there is no device for an id that is 0, not a number of 24 bits, or not whole', () => {
  expect(decodeDeviceId(0)).toBeNull()
  expect(decodeDeviceId(-5)).toBeNull()
  expect(decodeDeviceId(0x1000000)).toBeNull()
  expect(decodeDeviceId(1.5)).toBeNull()
})

it('lists the sensors the vehicle has the ids of, in order, with the ones never seen decoded to nothing', () => {
  const rows = deviceRows(new Map([['COMPASS_DEV_ID', 466_441], ['INS_ACC_ID', 590_082], ['INS_ACC2_ID', 0]]))

  expect(rows.map(row => `${row.kind}${row.index}`)).toEqual(['compass1', 'accel1', 'accel2'])
  expect(rows[2]?.decoded).toBeNull()
  expect(deviceRows(new Map())).toEqual([])
  expect(hexOf(0x1E)).toBe('0x1e')
  expect(hexOf(1)).toBe('0x01')
})
