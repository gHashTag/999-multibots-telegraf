/**
 * ONE WORKER THREAD, ONE JOB AT A TIME, WITH A DEADLINE AND A HEAP CEILING.
 *
 * For code that parses bytes a stranger sent. On the render server's event
 * loop such code shares one thread with every chat, upload and render, so a
 * parser that spins stops all of them, and one that runs out of heap kills
 * the process -- a fatal V8 error, which no try/catch reaches. In a worker
 * both become a value: the thread is terminated and `run` answers `timeout`
 * or `memory` while the server goes on answering everybody else.
 *
 * THE PROTOCOL, which a worker script implements:
 *
 *   worker -> { ready: true }            once, when it has loaded
 *   main   -> { id, job }                one job
 *   worker -> { id, result }             its answer
 *
 * One job at a time, in the order they came: a job is bounded by its own
 * deadline, so the queue is too, and a second thread per request would let a
 * burst of hostile files cost a burst of threads. The thread is kept between
 * jobs (starting one costs about half a second), stopped after `idleMs` of
 * nothing, and replaced whenever it had to be killed. It is unref'd: it never
 * keeps a process alive on its own.
 */

import { Worker } from 'node:worker_threads'

/**
 * `timeout`: the job ran past its deadline. `memory`: the thread ran out of
 * heap. `crashed`: the thread died some other way. `unavailable`: it died
 * before it had even loaded -- the script is missing or cannot start.
 */
export type IsolationFailure = 'timeout' | 'memory' | 'crashed' | 'unavailable'

export interface IsolatedOptions {
  /** Old-generation heap of the thread, in MB. Past it the THREAD dies. */
  heapMb: number
  /** A thread with nothing to do is stopped after this long. */
  idleMs: number
}

interface Reply<Result> {
  id?: number
  ready?: boolean
  result?: Result
}

export class IsolatedReader<Job, Result> {
  private worker: Worker | null = null
  private ready = false
  private line: Promise<unknown> = Promise.resolve()
  private idle: ReturnType<typeof setTimeout> | undefined
  private nextId = 1

  constructor(
    private readonly script: URL,
    private readonly opts: IsolatedOptions
  ) {}

  /** Run one job. Never rejects: every way the thread can fail is a value. */
  run(job: Job, timeoutMs: number): Promise<Result | IsolationFailure> {
    const turn = this.line.then(() => this.once(job, timeoutMs))
    this.line = turn.catch(() => undefined)
    return turn
  }

  /** Stop the thread now; the next job starts a new one. */
  async stop(): Promise<void> {
    clearTimeout(this.idle)
    const w = this.worker
    if (w) await this.kill(w)
  }

  private start(): Worker {
    const w = new Worker(this.script, {
      resourceLimits: {
        maxOldGenerationSizeMb: this.opts.heapMb,
        maxYoungGenerationSizeMb: Math.min(32, this.opts.heapMb),
        stackSizeMb: 4,
      },
    })
    w.unref()
    this.ready = false
    w.on('message', (m: Reply<Result> | null) => {
      if (m?.ready === true && this.worker === w) this.ready = true
    })
    /*
     * ALWAYS a listener: an 'error' event nobody listens to is thrown in the
     * main thread, and that would turn the thread's death back into ours.
     */
    w.on('error', () => undefined)
    w.on('exit', () => {
      if (this.worker === w) this.worker = null
    })
    return w
  }

  private once(
    job: Job,
    timeoutMs: number
  ): Promise<Result | IsolationFailure> {
    clearTimeout(this.idle)
    let w: Worker
    try {
      w = this.worker ?? (this.worker = this.start())
    } catch (e) {
      console.warn(`[isolated-reader] cannot start: ${String(e).slice(0, 160)}`)
      return Promise.resolve('unavailable')
    }
    const id = this.nextId++
    return new Promise(resolve => {
      let settled = false
      const finish = (out: Result | IsolationFailure, kill: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        w.off('message', onMessage)
        w.off('error', onError)
        w.off('exit', onExit)
        if (kill) void this.kill(w)
        else this.rest()
        resolve(out)
      }
      const onMessage = (m: Reply<Result> | null) => {
        if (m?.id !== id) return
        // A reply with no result is a broken worker, not an answer.
        if (m.result === undefined) finish('crashed', true)
        else finish(m.result, false)
      }
      const onError = (e: Error & { code?: string }) => {
        if (e?.code === 'ERR_WORKER_OUT_OF_MEMORY') finish('memory', true)
        else finish(this.ready ? 'crashed' : 'unavailable', true)
      }
      const onExit = () => finish(this.ready ? 'crashed' : 'unavailable', true)
      const timer = setTimeout(() => finish('timeout', true), timeoutMs)
      w.on('message', onMessage)
      w.on('error', onError)
      w.on('exit', onExit)
      try {
        w.postMessage({ id, job })
      } catch {
        finish('crashed', true)
      }
    })
  }

  private rest(): void {
    clearTimeout(this.idle)
    this.idle = setTimeout(() => {
      const w = this.worker
      if (w) void this.kill(w)
    }, this.opts.idleMs)
    this.idle.unref?.()
  }

  private async kill(w: Worker): Promise<void> {
    if (this.worker === w) {
      this.worker = null
      this.ready = false
    }
    await w.terminate().catch(() => undefined)
  }
}
