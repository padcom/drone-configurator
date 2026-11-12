// The little MAVLink the SITL harness needs: read a HEARTBEAT, send a PARAM_SET, read the PARAM_VALUE
// that answers it. Written from the MAVLink serialization spec (https://mavlink.io/en/guide/serialization.html).

const V1_MAGIC = 0xfe
const V2_MAGIC = 0xfd
const SIGNATURE_LENGTH = 13
const INCOMPAT_SIGNED = 0x01

export const MSG_HEARTBEAT = 0
export const MSG_PARAM_VALUE = 22
export const MSG_PARAM_SET = 23
export const MSG_GLOBAL_POSITION_INT = 33
export const MSG_COMMAND_LONG = 76
export const MSG_COMMAND_ACK = 77

/** The CRC_EXTRA byte of each message, from the common dialect's XML. */
const CRC_EXTRA: Record<number, number> = {
  [MSG_HEARTBEAT]: 50,
  [MSG_PARAM_VALUE]: 220,
  [MSG_PARAM_SET]: 168,
  [MSG_GLOBAL_POSITION_INT]: 104,
  [MSG_COMMAND_LONG]: 152,
  [MSG_COMMAND_ACK]: 143,
}

export const MAV_AUTOPILOT_ARDUPILOTMEGA = 3
const MAV_PARAM_TYPE_REAL32 = 9

export interface Frame {
  systemId: number
  componentId: number
  messageId: number
  /** Zero-padded by the caller if the sender trimmed it (MAVLink 2 does). */
  payload: Uint8Array
}

export interface Heartbeat {
  systemId: number
  componentId: number
  type: number
  autopilot: number
  /** MAV_MODE_FLAG_SAFETY_ARMED (128) is set in the base mode. */
  armed: boolean
  /** The flight mode (ArduPilot's custom mode). */
  customMode: number
}

export interface CommandAck {
  command: number
  /** MAV_RESULT: 0 is accepted. */
  result: number
}

export interface ParamValue {
  name: string
  value: number
}

/** X.25 CRC, as MAVLink uses it. */
export function crc16(bytes: Uint8Array, seed = 0xffff): number {
  let crc = seed
  for (const byte of bytes) {
    let tmp = byte ^ (crc & 0xff)
    tmp = (tmp ^ (tmp << 4)) & 0xff
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff
  }

  return crc
}

/**
 * Builds an unsigned MAVLink 2 frame.
 *
 * @param messageId the message
 * @param payload its payload, in wire order
 * @param sender who sends it
 * @param sequence the sequence number, 0-255
 * @returns the bytes
 * @throws Error for a message whose CRC_EXTRA isn't known here
 */
export function encodeFrame(messageId: number, payload: Uint8Array, sender: { systemId: number; componentId: number }, sequence = 0): Uint8Array {
  const crcExtra = CRC_EXTRA[messageId]
  if (crcExtra === undefined) {
    throw new Error(`no CRC_EXTRA for message ${messageId}`)
  }
  const frame = new Uint8Array(10 + payload.length + 2)
  frame.set([V2_MAGIC, payload.length, 0, 0, sequence & 0xff, sender.systemId, sender.componentId, messageId & 0xff, (messageId >> 8) & 0xff, (messageId >> 16) & 0xff])
  frame.set(payload, 10)
  const crc = crc16(Uint8Array.of(crcExtra), crc16(frame.subarray(1, 10 + payload.length)))
  frame[10 + payload.length] = crc & 0xff
  frame[11 + payload.length] = crc >> 8

  return frame
}

/** PARAM_SET for a float value, addressed to one vehicle. */
export function encodeParamSet(target: { systemId: number; componentId: number }, name: string, value: number): Uint8Array {
  if (name.length === 0 || name.length > 16) {
    throw new Error(`not a parameter name: ${JSON.stringify(name)}`)
  }
  const payload = new Uint8Array(23)
  const view = new DataView(payload.buffer)
  view.setFloat32(0, value, true)
  payload[4] = target.systemId
  payload[5] = target.componentId
  payload.set(new TextEncoder().encode(name), 6)
  payload[22] = MAV_PARAM_TYPE_REAL32

  return encodeFrame(MSG_PARAM_SET, payload, { systemId: 255, componentId: 190 })
}

/** Reads the frames out of a byte stream that may split or join them anywhere. */
export class FrameReader {
  #buffer: Uint8Array = new Uint8Array(0)

  /**
   * @param chunk the bytes that just arrived
   * @returns every complete frame with a good CRC and a message this module knows. The rest is skipped.
   */
  push(chunk: Uint8Array): Frame[] {
    const joined = new Uint8Array(this.#buffer.length + chunk.length)
    joined.set(this.#buffer)
    joined.set(chunk, this.#buffer.length)
    this.#buffer = joined

    const frames: Frame[] = []
    let at = 0
    while (at < this.#buffer.length) {
      const magic = this.#buffer[at]
      if (magic !== V1_MAGIC && magic !== V2_MAGIC) {
        at += 1
        continue
      }
      const v2 = magic === V2_MAGIC
      const headerLength = v2 ? 10 : 6
      if (this.#buffer.length - at < headerLength) {
        break
      }
      const length = this.#buffer[at + 1] ?? 0
      const signed = v2 && ((this.#buffer[at + 2] ?? 0) & INCOMPAT_SIGNED) !== 0
      const total = headerLength + length + 2 + (signed ? SIGNATURE_LENGTH : 0)
      if (this.#buffer.length - at < total) {
        break
      }
      const frame = this.#decode(this.#buffer.subarray(at, at + total), v2, length)
      if (frame) {
        frames.push(frame)
        at += total
      } else {
        at += 1
      }
    }
    this.#buffer = this.#buffer.slice(at)

    return frames
  }

  #decode(bytes: Uint8Array, v2: boolean, length: number): Frame | undefined {
    const headerLength = v2 ? 10 : 6
    const messageId = v2 ? (bytes[7] ?? 0) | ((bytes[8] ?? 0) << 8) | ((bytes[9] ?? 0) << 16) : (bytes[5] ?? 0)
    const crcExtra = CRC_EXTRA[messageId]
    const crc = crc16(Uint8Array.of(crcExtra ?? 0), crc16(bytes.subarray(1, headerLength + length)))
    const sent = (bytes[headerLength + length] ?? 0) | ((bytes[headerLength + length + 1] ?? 0) << 8)
    if (crcExtra === undefined || crc !== sent) {
      return undefined
    }

    return {
      systemId: bytes[v2 ? 5 : 3] ?? 0,
      componentId: bytes[v2 ? 6 : 4] ?? 0,
      messageId,
      payload: bytes.slice(headerLength, headerLength + length),
    }
  }
}

function padded(payload: Uint8Array, length: number): Uint8Array {
  if (payload.length >= length) {
    return payload
  }
  const full = new Uint8Array(length)
  full.set(payload)

  return full
}

/** @returns the heartbeat in a frame, if it is one */
export function asHeartbeat(frame: Frame): Heartbeat | undefined {
  if (frame.messageId !== MSG_HEARTBEAT) {
    return undefined
  }
  const payload = padded(frame.payload, 9)

  const view = new DataView(payload.buffer, payload.byteOffset)

  return {
    systemId: frame.systemId,
    componentId: frame.componentId,
    type: payload[4] ?? 0,
    autopilot: payload[5] ?? 0,
    armed: ((payload[6] ?? 0) & 0x80) !== 0,
    customMode: view.getUint32(0, true),
  }
}

/** @returns the answer to a command in a frame, if it is a COMMAND_ACK */
export function asCommandAck(frame: Frame): CommandAck | undefined {
  if (frame.messageId !== MSG_COMMAND_ACK) {
    return undefined
  }
  const payload = padded(frame.payload, 3)

  return { command: (payload[0] ?? 0) | ((payload[1] ?? 0) << 8), result: payload[2] ?? 0 }
}

/** @returns the height above home in millimetres in a frame, if it is a GLOBAL_POSITION_INT */
export function asRelativeAltitude(frame: Frame): number | undefined {
  if (frame.messageId !== MSG_GLOBAL_POSITION_INT) {
    return undefined
  }
  const payload = padded(frame.payload, 28)

  return new DataView(payload.buffer, payload.byteOffset).getInt32(16, true)
}

/**
 * COMMAND_LONG to one vehicle (the confirmation is 0).
 *
 * @param target who it is for
 * @param command the MAV_CMD
 * @param params its seven parameters (missing ones are 0)
 * @returns the bytes of the frame
 */
export function encodeCommandLong(target: { systemId: number; componentId: number }, command: number, params: readonly number[] = []): Uint8Array {
  const payload = new Uint8Array(33)
  const view = new DataView(payload.buffer)
  for (let i = 0; i < 7; i++) {
    view.setFloat32(i * 4, params[i] ?? 0, true)
  }
  view.setUint16(28, command, true)
  payload[30] = target.systemId
  payload[31] = target.componentId

  return encodeFrame(MSG_COMMAND_LONG, payload, { systemId: 255, componentId: 190 })
}

/** @returns the parameter in a frame, if it is a PARAM_VALUE */
export function asParamValue(frame: Frame): ParamValue | undefined {
  if (frame.messageId !== MSG_PARAM_VALUE) {
    return undefined
  }
  const payload = padded(frame.payload, 25)
  const name = new TextDecoder().decode(payload.subarray(8, 24)).replace(/\0.*$/su, '')

  return { name, value: new DataView(payload.buffer, payload.byteOffset).getFloat32(0, true) }
}
