// A LOCAL stand-in for GitHub (#41), for the specs of the frame presets: never GitHub itself, and never ArduPilot's own presets
// (they are GPL and never part of the repository). It answers GitHub's API for the tree of `Tools/Frame_params` at any reference
// (`/api/git/trees/<ref>:Tools/Frame_params?recursive=1`, a tag ArduPilot has, or master) and the raw files
// (`/raw/<ref>/Tools/Frame_params/<path>`), with presets made up here; it can be down, or refuse as GitHub does when an address
// without an account has asked 60 times in an hour. The backend is pointed at it by DRONE_CONFIGURATOR_PRESETS_URL.
import { createHash } from 'node:crypto'
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

/** The made-up presets, by path: one that changes BATT_CAPACITY (and has a name no vehicle has), and two of other kinds. */
export function madeUpPresets(capacity: number): Record<string, string> {
  return {
    'E2E-Quad-Long-Range.param': `# Made up by the end-to-end tests\r\nBATT_CAPACITY,${capacity}\r\nNOT_ON_VEHICLE,1\r\n`,
    'QuadPlanes/E2E-Plane.parm': 'Q_ENABLE 1\nQ_FRAME_CLASS 1\n',
    'Sub/e2e-sub.params': '1\t1\tFRAME_CONFIG\t1\t2\n',
  }
}

/** The git hash of a file's text, as GitHub's tree gives it. */
const blobHash = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex')

/** What the stand-in does, and what it saw. */
export class PresetsStandIn {
  /** `up`, `down` (503) or `limited` (GitHub's 403 with no requests left). */
  mode: 'up' | 'down' | 'limited' = 'up'
  /** The presets it serves, by path. */
  presets: Record<string, string> = madeUpPresets(4321)
  /** Every path asked for. */
  readonly hits: string[] = []
  #server: Server | undefined

  /**
   * Starts it on a free port of 127.0.0.1.
   *
   * @returns its address, for DRONE_CONFIGURATOR_PRESETS_URL
   */
  async start(): Promise<string> {
    const server = createServer((request, response) => this.#answer(request, response))
    this.#server = server
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })

    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  }

  /** Stops it. */
  stop(): void {
    this.#server?.close()
  }

  /**
   * The requests for the list.
   *
   * @returns their paths
   */
  lists(): string[] {
    return this.hits.filter(hit => hit.startsWith('/api/'))
  }

  /**
   * The requests for files.
   *
   * @returns their paths
   */
  files(): string[] {
    return this.hits.filter(hit => hit.startsWith('/raw/'))
  }

  /**
   * GitHub's tree of the folder: the presets, a folder and a file that is not a preset.
   *
   * @returns its JSON
   */
  #tree(): string {
    const blobs = Object.entries(this.presets).map(([path, text]) => ({
      path, mode: '100644', type: 'blob', sha: blobHash(text), size: Buffer.byteLength(text),
    }))
    const readme = { path: 'Sub/README.md', mode: '100644', type: 'blob', sha: blobHash('x'), size: 1 }
    const folder = { path: 'Sub', mode: '040000', type: 'tree', sha: blobHash('folder') }

    return JSON.stringify({ sha: blobHash('tree'), tree: [...blobs, folder, readme], truncated: false })
  }

  /**
   * What a path is answered with while it is up.
   *
   * @param path the path asked for
   * @returns the status and the body
   */
  #content(path: string): [number, string] {
    if (/^\/api\/git\/trees\/[\w.-]+:Tools\/Frame_params\?recursive=1$/u.test(path)) {
      return [200, this.#tree()]
    }
    const file = /^\/raw\/[\w.-]+\/Tools\/Frame_params\/(?<path>.+)$/u.exec(path)?.groups?.path
    const text = file === undefined ? undefined : this.presets[decodeURIComponent(file)]

    return text === undefined ? [404, '404: Not Found'] : [200, text]
  }

  /**
   * Answers a request.
   *
   * @param request the request
   * @param response its answer
   */
  #answer(request: IncomingMessage, response: ServerResponse): void {
    const path = request.url ?? ''
    this.hits.push(path)
    if (this.mode !== 'up') {
      const limited = this.mode === 'limited'
      response.writeHead(limited ? 403 : 503, limited ? { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' } : {})
      response.end(limited ? '{"message": "API rate limit exceeded"}' : 'busy')

      return
    }
    const [status, body] = this.#content(path)
    response.writeHead(status, { 'content-type': 'text/plain' })
    response.end(body)
  }
}
