// A fake mDNS advertiser for the E2E tests of network discovery (#197): a UDP port on 127.0.0.1 that answers the backend's
// one-shot DNS-SD queries (RFC 6762 section 5.1) as Avahi does, the PTR answer with the SRV and the address as additional
// records. The backend asks it instead of the network when DRONE_CONFIGURATOR_MDNS=127.0.0.1:<port> is in its environment
// (apps/backend/discovery.pi). The DNS messages are written here by hand, apart from the backend's own code, so that each checks
// the other.
import { type RemoteInfo, type Socket, createSocket } from 'node:dgram'

/** A service it advertises. */
export interface Advertised {
  /** The instance's name, as the user sees it. */
  instance: string
  /** The DNS-SD service type. */
  type: '_mavlink._udp' | '_mavlink._tcp'
  /** The host the SRV record names. */
  host: string
  /** The host's IPv4 address. */
  address: string
  /** The port the SRV record names. */
  port: number
}

const TYPE_A = 1
const TYPE_PTR = 12
const TYPE_SRV = 33

/** A question of a query: a name in lower case, without the final dot, and a type. */
interface Question {
  name: string
  type: number
}

/**
 * A name as DNS writes it (no compression).
 *
 * @param name the name, labels joined with dots
 * @returns its bytes
 */
function nameBytes(name: string): Buffer {
  const labels = name.split('.').filter(label => label.length > 0).map(label => Buffer.from(label, 'utf8'))

  return Buffer.concat([...labels.flatMap(label => [Buffer.from([label.length]), label]), Buffer.from([0])])
}

/**
 * A 16-bit big-endian number.
 *
 * @param value the number
 * @returns its two bytes
 */
function u16(value: number): Buffer {
  const out = Buffer.alloc(2)
  out.writeUInt16BE(value)

  return out
}

/**
 * A resource record of class IN with a TTL of 10 s.
 *
 * @param owner its name
 * @param type its type
 * @param data its data
 * @returns its bytes
 */
function record(owner: string, type: number, data: Buffer): Buffer {
  return Buffer.concat([nameBytes(owner), u16(type), u16(1), u16(0), u16(10), u16(data.length), data])
}

/**
 * The full name of a service's instance.
 *
 * @param service the service
 * @returns the instance's name
 */
function instanceOf(service: Advertised): string {
  return `${service.instance}.${service.type}.local`
}

/**
 * Reads the name at `at` of a query (the backend's queries are not compressed).
 *
 * @param bytes the message
 * @param at where the name starts
 * @returns the labels and where the bytes after the name start
 */
function readName(bytes: Buffer, at: number): { name: string, next: number } {
  const labels: string[] = []
  let i = at
  while (i < bytes.length && bytes[i] !== 0) {
    const length = bytes[i] ?? 0
    labels.push(bytes.subarray(i + 1, i + 1 + length).toString('utf8'))
    i += 1 + length
  }

  return { name: labels.join('.').toLowerCase(), next: i + 1 }
}

/**
 * The questions of a query, and where they end.
 *
 * @param query the query
 * @returns the questions, and the offset after the last
 */
function questionsOf(query: Buffer): { questions: Question[], end: number } {
  const questions: Question[] = []
  let at = 12
  for (let i = 0; i < query.readUInt16BE(4); i++) {
    const { name, next } = readName(query, at)
    questions.push({ name, type: query.readUInt16BE(next) })
    at = next + 4
  }

  return { questions, end: at }
}

/**
 * What a service answers to one question: the answer records, and the additional ones.
 *
 * @param question the question
 * @param service the service
 * @returns the records
 */
function answersOf(question: Question, service: Advertised): { answers: Buffer[], additional: Buffer[] } {
  const srv = record(instanceOf(service), TYPE_SRV, Buffer.concat([u16(0), u16(0), u16(service.port), nameBytes(service.host)]))
  const a = record(service.host, TYPE_A, Buffer.from(service.address.split('.').map(Number)))
  const asked = (name: string, type: number) => question.name === name.toLowerCase() && question.type === type
  if (asked(`${service.type}.local`, TYPE_PTR)) {
    return { answers: [record(`${service.type}.local`, TYPE_PTR, nameBytes(instanceOf(service)))], additional: [srv, a] }
  }

  const answers = [...(asked(instanceOf(service), TYPE_SRV) ? [srv] : []), ...(asked(service.host, TYPE_A) ? [a] : [])]

  return { answers, additional: [] }
}

/**
 * The answer to a query, with its question echoed and its id kept (as a one-shot query's answer must be).
 *
 * @param query the query
 * @param services what is advertised
 * @returns the answer
 */
export function answer(query: Buffer, services: readonly Advertised[]): Buffer {
  const { questions, end } = questionsOf(query)
  const parts = questions.flatMap(question => services.map(service => answersOf(question, service)))
  const answers = parts.flatMap(part => part.answers)
  const additional = parts.flatMap(part => part.additional)
  const counts = [questions.length, answers.length, 0, additional.length].map(count => u16(count))
  const header = Buffer.concat([query.subarray(0, 2), u16(0x84_00), ...counts])

  return Buffer.concat([header, query.subarray(12, end), ...answers, ...additional])
}

/** The fake advertiser, on a UDP port of 127.0.0.1. */
export class FakeAdvertiser {
  /** How many queries it has answered. */
  queries = 0
  readonly #socket: Socket
  readonly #services: readonly Advertised[]

  private constructor(socket: Socket, services: readonly Advertised[]) {
    this.#socket = socket
    this.#services = services
  }

  /**
   * Starts it.
   *
   * @param services what it advertises
   * @returns the running advertiser
   */
  static async start(services: readonly Advertised[]): Promise<FakeAdvertiser> {
    const socket = createSocket('udp4')
    const advertiser = new FakeAdvertiser(socket, services)
    socket.on('message', (message, from) => advertiser.#answer(message, from))
    await new Promise<void>(resolve => {
      socket.bind(0, '127.0.0.1', resolve)
    })

    return advertiser
  }

  /**
   * The port it answers on.
   *
   * @returns the port
   */
  get port(): number {
    return this.#socket.address().port
  }

  /**
   * What the backend's environment names it by (DRONE_CONFIGURATOR_MDNS).
   *
   * @returns `127.0.0.1:<port>`
   */
  get address(): string {
    return `127.0.0.1:${this.port}`
  }

  /** Stops it. */
  close(): void {
    this.#socket.close()
  }

  /**
   * Answers a query where it came from.
   *
   * @param message the query
   * @param from who sent it
   */
  #answer(message: Buffer, from: RemoteInfo): void {
    this.queries += 1
    this.#socket.send(answer(message, this.#services), from.port, from.address)
  }
}
