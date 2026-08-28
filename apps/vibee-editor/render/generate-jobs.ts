/**
 * Jobs for generation, so a dropped connection cannot lose a paid result.
 *
 * WHAT WAS WRONG. POST /api/generate/video answers synchronously after ~54
 * seconds, measured on production. The client waits in a single fetch with no
 * timeout and no way to ask again. Any interruption in that window — a phone
 * locking, a train tunnel, a proxy's 30-second cap — loses a generation that
 * has already been paid for at the provider. The money is spent, the file
 * exists in storage, and nobody can find it.
 *
 * WHAT THIS CHANGES. The result is recorded the moment it exists, under an id
 * the caller was handed before the work started. The slow response stays for
 * clients that want it, because changing that is a client migration and this
 * is not. What is new is that the answer survives the caller going away.
 *
 * DELIBERATELY IN MEMORY, LIKE renderJobs. A restart forgets the index — but
 * the asset itself is already in storage and in the assets table, so what is
 * lost is a convenience, not the result. A table here would be better and is
 * a separate change; pretending this is durable would be worse than saying it
 * is not.
 */

import crypto from 'node:crypto'

export type JobState = 'running' | 'done' | 'failed'

export interface GenerateJob {
  id: string
  kind: 'image' | 'video' | 'audio' | 'lipsync'
  /** Whose job it is. Empty when the caller authenticated server-to-server. */
  owner: string
  state: JobState
  startedAt: number
  finishedAt?: number
  url?: string
  provider?: string
  error?: string
  /** Echoed back so a recovered job is recognisable without a second lookup. */
  prompt?: string
}

const jobs = new Map<string, GenerateJob>()

/**
 * An hour, matching renderJobs.
 *
 * Long enough that someone who lost the connection can still find the result
 * after re-opening the app; short enough that the map cannot grow without
 * bound on a long-lived process.
 */
const TTL_MS = 60 * 60 * 1000

const sweeper = setInterval(() => {
  const cutoff = Date.now() - TTL_MS
  for (const [id, job] of jobs) {
    if ((job.finishedAt ?? job.startedAt) < cutoff) jobs.delete(id)
  }
}, 5 * 60 * 1000)
// A bare setInterval keeps the event loop alive and makes tests hang on exit.
sweeper.unref?.()

export function startJob(
  kind: GenerateJob['kind'],
  owner: string,
  prompt?: string
): GenerateJob {
  const job: GenerateJob = {
    id: crypto.randomUUID(),
    kind,
    owner: owner || '',
    state: 'running',
    startedAt: Date.now(),
    prompt: prompt?.slice(0, 200),
  }
  jobs.set(job.id, job)
  return job
}

export function finishJob(id: string, url: string, provider?: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.state = 'done'
  job.url = url
  job.provider = provider
  job.finishedAt = Date.now()
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.state = 'failed'
  // Truncated: provider errors can carry whole HTML pages, and this is read
  // by a person on a phone screen.
  job.error = error.slice(0, 400)
  job.finishedAt = Date.now()
}

export function getJob(id: string): GenerateJob | undefined {
  return jobs.get(id)
}

/**
 * Recent jobs for one person, newest first.
 *
 * OWNERSHIP IS ENFORCED HERE, not by the caller. A generation prompt is
 * personal — it says what someone was trying to make — and the url points at
 * a file they paid for. Returning another account's list would be a leak, so
 * an empty owner matches NOTHING rather than matching everything, which is
 * what a naive `job.owner === owner` would do for a server-to-server caller.
 */
export function listJobs(owner: string, limit = 20): GenerateJob[] {
  if (!owner) return []
  return [...jobs.values()]
    .filter(j => j.owner === owner)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
}

/** Test seam: the sweeper is time-based and tests must not wait an hour. */
export function _resetJobs(): void {
  jobs.clear()
}

/**
 * Record whatever this route ends up answering, whichever branch produces it.
 *
 * The video handler has several success points — the primary provider, a
 * fallback, and two error paths — and hooking each one means editing tangled
 * provider logic four times and missing the fifth when someone adds it.
 * Wrapping `end` once catches every branch by construction, including
 * branches that do not exist yet.
 *
 * `end` is wrapped, not replaced: the original still runs, so the slow
 * synchronous answer is untouched for clients that are waiting for it.
 */
export function recordInto(job: GenerateJob, res: {
  end: (chunk?: any, ...rest: any[]) => any
}): void {
  const original = res.end.bind(res)
  res.end = ((chunk?: any, ...rest: any[]) => {
    try {
      const text = typeof chunk === 'string' ? chunk : chunk?.toString?.('utf8')
      if (text) {
        const parsed = JSON.parse(text)
        if (parsed?.success && parsed?.url) {
          finishJob(job.id, String(parsed.url), parsed.provider)
        } else if (parsed?.error) {
          failJob(job.id, String(parsed.error))
        }
      }
    } catch {
      // A non-JSON body is not a reason to fail the request. The job simply
      // stays 'running' and is swept — losing the index entry, never the
      // response the caller is about to receive.
    }
    return original(chunk, ...rest)
  }) as typeof res.end
}
