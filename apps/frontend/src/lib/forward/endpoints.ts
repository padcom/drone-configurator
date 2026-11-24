// The endpoints the vehicle's MAVLink is forwarded to (#34), as the settings keep them: the `ui` entry `forward.endpoints`, a
// JSON array of `{ kind, host, port, on }`. The BACKEND reads the same entry and forwards by it (apps/backend/forward.pi), so the
// key, the shape and the limits here are a contract with it: the page only edits the list.

/** The key of the settings entry. */
export const FORWARD_KEY = 'forward.endpoints'

/** How many endpoints the backend takes (the rest are ignored, so the page adds no more). */
export const MAX_ENDPOINTS = 16

/** The kinds of endpoint. */
export const FORWARD_KINDS = ['udp', 'tcp'] as const

/** A kind of endpoint. */
export type ForwardKindName = typeof FORWARD_KINDS[number]

/** One endpoint, as the settings keep it. */
export interface EndpointSetting {
  /** How it is reached. */
  kind: ForwardKindName
  /** Its host name or address. */
  host: string
  /** Its port, 1 to 65535. */
  port: number
  /** Whether frames go to it. */
  on: boolean
}

/** Why an endpoint cannot be added: the key of its words (under `settings.forward.problems`). */
export type EndpointProblem = 'host' | 'port' | 'duplicate' | 'full'

/**
 * Whether a host can be named (the backend takes 1 to 253 characters; spaces are never part of one).
 *
 * @param host what was typed
 * @returns true if it can
 */
function validHost(host: string): boolean {
  return host.length > 0 && host.length <= 253 && !/\s/u.test(host)
}

/**
 * Whether a port is one.
 *
 * @param port the number
 * @returns true if it is 1 to 65535
 */
function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

/**
 * Whether a member of the list has the fields of an endpoint, of the right kinds.
 *
 * @param e one member of the list
 * @returns true if it has
 */
function isShaped(e: Partial<EndpointSetting>): boolean {
  return FORWARD_KINDS.includes(e.kind as ForwardKindName) && typeof e.host === 'string' && typeof e.on === 'boolean'
}

/**
 * Whether a value is an endpoint the backend takes.
 *
 * @param value one member of the list
 * @returns true if it is
 */
function isEndpoint(value: unknown): value is EndpointSetting {
  const e = (value ?? {}) as Partial<EndpointSetting>

  return isShaped(e) && validHost(String(e.host)) && validPort(Number(e.port))
}

/**
 * The endpoints the settings hold, as the backend reads them: the ones that make sense, at most `MAX_ENDPOINTS`. Text that is not
 * such a list is none.
 *
 * @param text the entry, if there is one
 * @returns the endpoints, in order
 */
export function parseEndpoints(text: string | undefined): EndpointSetting[] {
  try {
    const all: unknown = JSON.parse(text ?? '[]')

    return Array.isArray(all) ? all.filter(isEndpoint).slice(0, MAX_ENDPOINTS) : []
  } catch {
    return []
  }
}

/**
 * The entry for a list of endpoints.
 *
 * @param endpoints the list
 * @returns the text the settings keep
 */
export function endpointsText(endpoints: readonly EndpointSetting[]): string {
  return JSON.stringify(endpoints.map(({ kind, host, port, on }) => ({ kind, host, port, on })))
}

/**
 * What tells one endpoint from another.
 *
 * @param e the endpoint
 * @returns its key
 */
export function endpointKey(e: Pick<EndpointSetting, 'kind' | 'host' | 'port'>): string {
  return `${e.kind}:${e.host}:${e.port}`
}

/**
 * Why an endpoint cannot be added to a list, or null when it can.
 *
 * @param list the endpoints there are
 * @param candidate what was typed: the kind, the host and the port as text
 * @param candidate.kind how it is reached
 * @param candidate.host the host, as typed
 * @param candidate.port the port, as typed
 * @returns the problem, or null
 */
export function problemOf(
  list: readonly EndpointSetting[],
  candidate: { kind: ForwardKindName, host: string, port: string },
): EndpointProblem | null {
  const host = candidate.host.trim()
  const port = Number(candidate.port.trim())
  const checks: [boolean, EndpointProblem][] = [
    [list.length >= MAX_ENDPOINTS, 'full'],
    [!validHost(host), 'host'],
    [!/^\d+$/u.test(candidate.port.trim()) || !validPort(port), 'port'],
    [list.some(e => endpointKey(e) === endpointKey({ kind: candidate.kind, host, port })), 'duplicate'],
  ]

  return checks.find(([failed]) => failed)?.[1] ?? null
}
