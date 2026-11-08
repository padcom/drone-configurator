import { type ChildProcessByStdio, spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { announcedPort } from './announced-port'

describe('announcedPort', () => {
  let child: ChildProcessByStdio<null, Readable, null>

  const run = (script: string) => {
    child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] })

    return child
  }

  afterEach(() => {
    child.kill()
  })

  it('reads the port', async () => {
    await expect(announcedPort(run('console.log("listening 5760"); setInterval(() => {}, 1000)'))).resolves.toBe(5760)
  })

  it('passes on the lines after it', async () => {
    const lines: string[] = []
    await announcedPort(run('console.log("listening 5760\\nparam-set"); setInterval(() => {}, 1000)'), line => lines.push(line))
    await vi.waitFor(() => expect(lines).toEqual(['param-set']))
  })

  it('fails at once if the process exits first', async () => {
    await expect(announcedPort(run('process.exit(3)'))).rejects.toThrow('exited before saying its port (exit code 3')
  })

  it('fails at once on anything else', async () => {
    await expect(announcedPort(run('console.log("hello"); setInterval(() => {}, 1000)'))).rejects.toThrow('it said "hello"')
  })

  it('fails if the program can\'t start', async () => {
    child = spawn('/nonexistent/program', [], { stdio: ['ignore', 'pipe', 'ignore'] })
    await expect(announcedPort(child)).rejects.toThrow('ENOENT')
  })
})
