// The device ids the vehicle keeps for its sensors, decoded. The id is a 24-bit field (libraries/AP_HAL/Device.h lines 371 to
// 376): the low 3 bits are the kind of bus (the BusType of lines 36 to 43), the next 5 which one of that kind, the next 8 the
// address on it (an I2C address, or the chip select of an SPI device), and the top 8 a device type that only means something
// for that kind of sensor (a compass's, a barometer's, an IMU's), so it is shown as the number it is, never as a name that
// was guessed. An id of 0 is a sensor that was never seen.

/** What a device id is made of. */
export interface DeviceId {
  /** The kind of bus: `i2c`, `spi`, `dronecan`, `sitl`, `msp`, `serial`, `wspi`, or `unknown`. */
  bus: string
  /** Which bus of that kind. */
  instance: number
  /** The address on it. */
  address: number
  /** The device type, a number that only means something for the kind of sensor. */
  type: number
}

const BUS_KINDS: readonly string[] = ['unknown', 'i2c', 'spi', 'dronecan', 'sitl', 'msp', 'serial', 'wspi']

/**
 * Whether a number can be a device id: a whole number that fits the 24 bits, and is not 0.
 *
 * @param id the number
 * @returns true if it can
 */
function isDeviceId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= 0xFFFFFF
}

/**
 * Decodes a device id.
 *
 * @param id the id as a parameter holds it
 * @returns what it is made of, or null for 0 (no such sensor) or a number that is not an id
 */
export function decodeDeviceId(id: number): DeviceId | null {
  if (!isDeviceId(id)) {
    return null
  }

  return {
    bus: BUS_KINDS[id & 7] ?? 'unknown',
    instance: (id >> 3) & 31,
    address: (id >> 8) & 255,
    type: (id >> 16) & 255,
  }
}

/** The kinds of sensor the page lists, with the parameters that hold their ids, one for each instance. */
export const SENSORS: readonly { kind: string, params: readonly string[] }[] = [
  { kind: 'compass', params: ['COMPASS_DEV_ID', 'COMPASS_DEV_ID2', 'COMPASS_DEV_ID3'] },
  { kind: 'accel', params: ['INS_ACC_ID', 'INS_ACC2_ID', 'INS_ACC3_ID'] },
  { kind: 'gyro', params: ['INS_GYR_ID', 'INS_GYR2_ID', 'INS_GYR3_ID'] },
  { kind: 'baro', params: ['BARO1_DEVID', 'BARO2_DEVID', 'BARO3_DEVID'] },
]

/**
 * The address as hexadecimal text.
 *
 * @param address the address
 * @returns `0x` and its digits
 */
export function hexOf(address: number): string {
  return `0x${address.toString(16).padStart(2, '0')}`
}

/** A row of the page: which sensor, the parameter that holds its id, the id, and what it decodes to (null for 0). */
export interface DeviceRow {
  /**
   *
   */
  kind: string
  /**
   *
   */
  index: number
  /**
   *
   */
  param: string
  /**
   *
   */
  id: number
  /**
   *
   */
  decoded: DeviceId | null
}

/**
 * The rows for the sensors the vehicle has the parameters of.
 *
 * @param values the parameters by name
 * @returns the rows, in the order of the sensors
 */
export function deviceRows(values: ReadonlyMap<string, number>): DeviceRow[] {
  const rows: DeviceRow[] = []
  for (const sensor of SENSORS) {
    sensor.params.forEach((param, i) => {
      const id = values.get(param)
      if (id !== undefined) {
        rows.push({ kind: sensor.kind, index: i + 1, param, id, decoded: decodeDeviceId(id) })
      }
    })
  }

  return rows
}
