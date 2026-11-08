import type { ChildProcessByStdio } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

/**
 * Waits for a child process to print `listening <port>` as its first line.
 *
 * @param child the process, with its stdout piped
 * @param onLine gets every later line
 * @returns the port
 * @throws Error at once if it can't start, exits first, or prints anything else
 */
export function announcedPort(child: ChildProcessByStdio<Writable | null, Readable, null>, onLine: (line: string) => void = () => {}): Promise<number> {
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
      const port = Number(/^listening (?<port>\d+)$/u.exec(line)?.groups?.port)
      if (port > 0) {
        resolve(port)
      } else {
        reject(new Error(`it said ${JSON.stringify(line)}, not "listening <port>"`))
      }
    })
  })
}
