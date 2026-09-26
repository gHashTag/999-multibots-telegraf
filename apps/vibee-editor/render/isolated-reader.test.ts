import { describe, it, expect, afterEach } from 'vitest'
import { IsolatedReader } from './src/agent/isolated-reader'

/**
 * A PARSER'S WORST DAY IS NOT THE SERVER'S.
 *
 * The render server runs every chat, upload and render on one event loop. A
 * parser that spins on a stranger's file stops all of them, and one that
 * blows the heap kills the process with a fatal V8 error that no try/catch
 * can catch -- the review of the office readers measured both (2026-09-22).
 * IsolatedReader moves such code into a worker thread with a deadline and a
 * heap ceiling. These cases run a worker that misbehaves on purpose and
 * check three things each time: the job comes back as a named failure, the
 * main thread kept ticking meanwhile, and the NEXT job works.
 */

const HOSTILE = new URL('./test-support/hostile-worker.mjs', import.meta.url)
const readers: Array<IsolatedReader<string, string>> = []
const reader = (script = HOSTILE, heapMb = 64) => {
  const r = new IsolatedReader<string, string>(script, {
    heapMb,
    idleMs: 5_000,
  })
  readers.push(r)
  return r
}

/** Counts the main thread's timer ticks while `work` runs. */
async function ticking<T>(
  work: Promise<T>
): Promise<{ out: T; ticks: number }> {
  let ticks = 0
  const probe = setInterval(() => (ticks += 1), 10)
  try {
    return { out: await work, ticks }
  } finally {
    clearInterval(probe)
  }
}

afterEach(async () => {
  await Promise.all(readers.splice(0).map(r => r.stop()))
})

describe('a worker thread with a deadline and a heap ceiling', () => {
  it('answers a job and keeps the thread for the next one', async () => {
    const r = reader()
    expect(await r.run('a', 10_000)).toBe('echo:a')
    expect(await r.run('b', 10_000)).toBe('echo:b')
  })

  it('stops a job that never ends, while the server goes on ticking', async () => {
    const r = reader()
    await r.run('warm', 10_000)
    const started = Date.now()
    const { out, ticks } = await ticking(r.run('spin', 400))
    expect(out).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(5_000)
    // 400 ms at a 10 ms interval: a blocked loop would count zero.
    expect(ticks).toBeGreaterThan(10)
    expect(await r.run('after', 10_000)).toBe('echo:after')
  })

  /*
   * THE BUDGET IS MEASURED, NOT HOPED. On a laptop the worker hits its
   * ceiling in milliseconds; in a sandboxed container every fresh page is a
   * slow fault, and the same hog took 19-37 s to die (2026-09-26, node 22,
   * 4 cores: a single 256 MB array took 23 s just to allocate). The default
   * 5 s test timeout made this case red on such hosts while the reader did
   * exactly its job. The assertion stays `memory` -- the ceiling must be
   * what stops it -- and the time allowed covers the slow host.
   */
  it('turns a heap blown by one file into a refusal, not a dead process', async () => {
    const r = reader(HOSTILE, 32)
    const { out, ticks } = await ticking(r.run('hog', 80_000))
    expect(out).toBe('memory')
    expect(ticks).toBeGreaterThan(0)
    expect(await r.run('after', 10_000)).toBe('echo:after')
  }, 100_000)

  it('survives a thread that dies between jobs, and starts a new one', async () => {
    const r = reader()
    expect(await r.run('late-throw', 10_000)).toBe('echo:late-throw')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(await r.run('after', 10_000)).toBe('echo:after')
  })

  it('queues jobs: a slow one delays the next, it does not share its thread', async () => {
    const r = reader()
    const [first, second] = await Promise.all([
      r.run('spin', 300),
      r.run('second', 10_000),
    ])
    expect(first).toBe('timeout')
    expect(second).toBe('echo:second')
  })

  it('names a worker that cannot load as unavailable, and a broken answer as a crash', async () => {
    const broken = reader(
      new URL('./test-support/broken-worker.mjs', import.meta.url)
    )
    expect(await broken.run('x', 10_000)).toBe('unavailable')
    const missing = reader(
      new URL('./test-support/no-such-worker.mjs', import.meta.url)
    )
    expect(await missing.run('x', 10_000)).toBe('unavailable')
    const r = reader()
    expect(await r.run('silent', 10_000)).toBe('crashed')
    expect(await r.run('after', 10_000)).toBe('echo:after')
  })
})
