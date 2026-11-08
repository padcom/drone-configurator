import type { ChildProcessByStdio } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

/**
 * Waits for a child process to print `listening <port>` as its first line.
 *
 * @param child the process, with its stdout piped
 * @returns the port
 * @throws Error at once if it can't start, exits first, or prints anything else
 */
export function announcedPort(child: ChildProcessByStdio<null, Readable, null>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      reject(new Error(`it exited before saying its port (exit code ${code}, signal ${signal})`))
    })
    createInterface({ input: child.stdout }).once('line', line => {
      const port = Number(/^listening (?<port>\d+)$/u.exec(line)?.groups?.port)
      if (port > 0) {
        resolve(port)
      } else {
        reject(new Error(`it said ${JSON.stringify(line)}, not "listening <port>"`))
      }
    })
  })
}
