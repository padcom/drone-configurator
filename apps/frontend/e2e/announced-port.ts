import type { ChildProcessByStdio } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

/** A child process with its stdout piped. */
type Announcer = ChildProcessByStdio<Writable | null, Readable, null>

/**
 * The port in a `listening <port>` line.
 *
 * @param line the first line the process printed
 * @returns the port, or NaN if the line isn't that
 */
function portIn(line: string): number {
  return Number(/^listening (?<port>\d+)$/u.exec(line)?.groups?.port)
}

/**
 * Waits for a child process to print `listening <port>` as its first line.
 *
 * @param child the process, with its stdout piped
 * @param onLine gets every later line
 * @returns the port
 * @throws {Error} at once if it can't start, exits first, or prints anything else
 */
export function announcedPort(child: Announcer, onLine: (line: string) => void = () => {}): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      reject(new Error(`it exited before saying its port (exit code ${code}, signal ${signal})`))
    })
    let first = true
    createInterface({ input: child.stdout }).on('line', line => {
      if (!first) {
        onLine(line)

        return
      }
      first = false
      const port = portIn(line)
      if (port > 0) {
        resolve(port)
      } else {
        reject(new Error(`it said ${JSON.stringify(line)}, not "listening <port>"`))
      }
    })
  })
}
