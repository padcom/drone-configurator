// End to end, in the real window: the Pico Desktop host, the Pico backend, pico-mavlink and the
// simulated vehicle. Builds the app, starts the host with remote debugging, drives the page over
// the DevTools protocol, and checks what the user would see.
//
//   node tests/e2e.mjs        (needs a display: Xvfb in CI; the host from PICO_DESKTOP_HOST or
//                             ../pico-desktop/build/cef)
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const host = process.env.PICO_DESKTOP_HOST ?? resolve(root, '../pico-desktop/build/cef/runtime/cef-host/pico-desktop-host')
if (!existsSync(host)) {
  console.log(`skipped: no host at ${host}`)
  process.exit(77)
}
const out = mkdtempSync(join(tmpdir(), 'dc-e2e-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise(r => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)) })
})

execFileSync('npx', ['vite', 'build', '--outDir', join(out, 'frontend'), '--emptyOutDir'], { cwd: join(root, 'apps/frontend'), stdio: 'ignore' })
execFileSync('pico', ['build', 'main.pi', '-o', join(out, 'backend')], { cwd: join(root, 'apps/backend'), stdio: 'inherit' })

const port = await freePort()
const app = spawn(host, [`--app-dir=${join(out, 'frontend')}`, '--app-id=dev.pico-desktop.drone-configurator.e2e', `--backend=${join(out, 'backend')}`,
  '--capabilities=window,dialogs', '--dev', `--remote-debugging-port=${port}`, '--multi-instance'], { stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
app.stdout.on('data', d => { log += d })
app.stderr.on('data', d => { log += d })

const failures = []
const check = (what, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${ok ? '' : `: ${detail}`}`)
  if (!ok) failures.push(what)
}

try {
  let targets = []
  for (let i = 0; i < 100 && targets.length === 0; i++) {
    await sleep(100)
    targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => [])
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
  let id = 0
  const replies = new Map()
  ws.onmessage = m => { const d = JSON.parse(m.data); replies.get(d.id)?.(d.result); replies.delete(d.id) }
  await new Promise(r => { ws.onopen = r })
  const js = expression => new Promise(r => {
    const n = ++id
    replies.set(n, res => r(res?.result?.value))
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  })
  const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`)
  const until = async (sel, pattern, ms = 8000) => {
    for (let t = 0; t < ms; t += 100) {
      const s = await text(sel)
      if (pattern.test(s)) return s
      await sleep(100)
    }
    return text(sel)
  }

  await until('#connection', /disconnected/)
  await js("document.getElementById('connect-button').click()")
  const connection = await until('#connection', /connected · system/)
  check('connects to the simulator through the Pico backend', /connected · system 1\/1 · QUADROTOR · ARDUPILOTMEGA/.test(connection), connection)
  const list = await until('#list-status', /12 parameters/)
  check('downloads the 12 parameters', list === '12 parameters', list)
  const telemetry = await until('#telemetry', /Heartbeat/)
  check('shows telemetry', /Mode/.test(telemetry) && /Battery/.test(telemetry), telemetry)

  await js(`document.querySelector('tr[data-id="RTL_ALT"]').click()`)
  await js(`const d = document.getElementById('draft'); d.value = '1600'; d.dispatchEvent(new Event('input'))`)
  await js("document.getElementById('write').click()")
  const question = await until('#question', /Set RTL_ALT/)
  check('asks before writing', question === 'Set RTL_ALT from 1500 to 1600?', question)
  await js(`document.querySelector('#confirm button[value=yes]').click()`)
  const detail = await until('#detail', /Written and read back/)
  check('writes and verifies the read-back', /Written and read back: 1600\./.test(detail), detail)
  const row = await text('tr[data-id="RTL_ALT"]')
  check('shows the new value in the list', /1600/.test(row), row)

  await js("document.getElementById('disconnect-button').click()")
  const after = await until('#connection', /^disconnected/)
  check('disconnects', /^disconnected/.test(after), after)
  ws.close()
} catch (error) {
  failures.push(String(error))
  console.log(`✗ ${error}`)
} finally {
  app.kill('SIGTERM')
  await new Promise(r => app.on('close', r))
  check('the backend ends cleanly', /the backend ended \(exit code 0\)/.test(log), log.split('\n').filter(l => l.includes('pd-host')).join(' | '))
  rmSync(out, { recursive: true, force: true })
}
process.exit(failures.length === 0 ? 0 : 1)
