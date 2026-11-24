// The keystrokes of the Parameters screen's search, timed in the page (#36): the budget `paramFilterKeystroke` is judged on them
// by e2e/param-search-speed.e2e.ts (1,500 parameters) and e2e/sitl-params.e2e.ts (a real Copter's list).
import type { E2eApp } from './launch'

/** What typing the queries gave: the time of each keystroke, and the first row at the end of each query. */
export interface Typed {
  /** The time of each keystroke (ms). */
  times: number[]
  /** The first row each query ended with ('' for none). */
  firsts: string[]
}

/**
 * A page script that types each query a letter at a time into the search and says how long each letter took until the table's
 * rows had been made (the next task: the input event, Vue's update, the rows in the page), and what the first row is at the end.
 *
 * @param queries what is typed
 * @returns the script, which gives the times and the first rows
 */
function typing(queries: string[]): string {
  return `(async () => {
    const input = document.getElementById('filter')
    const times = []
    const firsts = []
    for (const query of ${JSON.stringify(queries)}) {
      for (let i = 1; i <= query.length; i++) {
        const start = performance.now()
        input.value = query.slice(0, i)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise(resolve => setTimeout(resolve, 0))
        times.push(performance.now() - start)
      }
      firsts.push(document.querySelector('#rows tr[data-id]')?.dataset.id ?? '')
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    return { times, firsts }
  })()`
}

/**
 * Types the queries once to warm up (the first keystrokes are cold), then `rounds` times, timed.
 *
 * @param app the running app, on the Parameters screen
 * @param queries what is typed
 * @param rounds how many timed rounds
 * @returns the time of every timed keystroke, and the first rows of the last round
 */
export async function typeQueries(app: E2eApp, queries: string[], rounds = 3): Promise<Typed> {
  await app.evaluate(typing(queries))
  const times: number[] = []
  const firsts: string[][] = []
  for (let round = 0; round < rounds; round++) {
    // eslint-disable-next-line no-await-in-loop -- one round after the other: the page does one thing at a time
    const run = await app.evaluate<Typed>(typing(queries))
    times.push(...run.times)
    firsts.push(run.firsts)
  }

  return { times, firsts: firsts.at(-1) ?? [] }
}
