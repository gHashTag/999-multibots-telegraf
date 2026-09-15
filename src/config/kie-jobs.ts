/**
 * THE KIE.AI JOBS API, AS MEASURED -- NOT AS REMEMBERED.
 *
 * Three places in this repository polled
 *
 *     GET https://api.kie.ai/api/v1/jobs/taskStatus
 *
 * and that path does not exist. Measured 2026-09-15 with the production
 * KIE_AI_API_KEY against a task the same key had just created successfully:
 *
 *     GET  /api/v1/jobs/taskStatus?taskId=...            -> HTTP 404
 *     POST /api/v1/jobs/taskStatus  {"taskId":"..."}     -> HTTP 404
 *     GET  /api/v1/jobs/recordInfo?taskId=...            -> HTTP 200
 *
 * The 404 body is Spring's own `{"timestamp":...,"status":404,"path":...}`,
 * not the API's `{"code","msg","data"}` envelope: the ROUTE is missing, so no
 * task id and no parameter spelling could ever have made it answer. Every
 * fallback poller built on it -- WAN 2.5 video, Sora 2, the Veed Fabric
 * lip-sync fallback -- therefore failed 100% of the time, and each one blamed
 * something else: WAN threw on `!response.ok`, the lip-sync provider returned
 * STATUS_CHECK_FAILED, Sora surfaced a network error. Three symptoms, one
 * missing route.
 *
 * recordInfo answers with the shape the callers were already parsing:
 *
 *   data.state        'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
 *   data.successFlag  0 pending, 1 success, 2 failed, 3 rejected by policy
 *   data.resultJson   a JSON *string*: {"resultUrls":["https://..."]}
 *   data.failMsg      the provider's reason, null while it is running
 *
 * Spelling the paths once, here, is the point: the wrong one survived in three
 * files because each held its own copy.
 */
export const KIE_JOBS = {
  BASE_URL: 'https://api.kie.ai',
  CREATE_TASK: '/api/v1/jobs/createTask',
  RECORD_INFO: '/api/v1/jobs/recordInfo',
} as const

/** The route that does not exist. Exported so a test can forbid it. */
export const KIE_DEAD_STATUS_PATH = '/api/v1/jobs/taskStatus'

export type KieJobState = 'pending' | 'success' | 'fail'

export interface KieJobRecord {
  state: KieJobState
  /** Result URLs, empty until the job succeeds. */
  urls: string[]
  /** Why it failed, when it failed. */
  failMsg?: string
}

/**
 * One reader for every kie.ai job, because the answer arrives in three
 * different spellings depending on which surface produced it:
 *
 *   - recordInfo returns `state` plus `resultJson` as a STRING;
 *   - the webhook callback returns `successFlag` plus `resultUrls` as an ARRAY;
 *   - the Sora path also carries a bare `videoUrl`.
 *
 * Reading only one spelling is how the lip-sync provider came to treat every
 * finished job as still running.
 *
 * Fail closed in the direction that costs nothing: anything unrecognised is
 * `pending`, so a caller keeps polling instead of refunding work the provider
 * actually delivered. Only an explicit failure is reported as one.
 */
export function readKieJobRecord(raw: unknown): KieJobRecord {
  const data = (raw ?? {}) as Record<string, any>

  const urls: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v) urls.push(v)
    else if (Array.isArray(v)) for (const one of v) push(one)
  }

  // resultJson is a string on this endpoint and an object on some others.
  let parsed: any = data.resultJson
  if (typeof parsed === 'string' && parsed.trim()) {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      parsed = null
    }
  }
  push(parsed?.resultUrls)
  push(parsed?.resultUrl)
  push(data.resultUrls)
  push(data.videoUrl)
  push(data.imageUrl)

  const failMsg =
    data.failMsg || data.errorMessage || data.failCode || undefined

  const state = String(data.state ?? '')
  if (state === 'fail' || data.successFlag === 2 || data.successFlag === 3) {
    return { state: 'fail', urls, failMsg: failMsg || 'kie.ai job failed' }
  }

  // Success needs a URL to be worth anything. A job flagged done with nothing
  // attached is still pending as far as the caller is concerned -- that is the
  // case that used to refund a job kie.ai had produced.
  if ((state === 'success' || data.successFlag === 1) && urls.length) {
    return { state: 'success', urls }
  }

  return { state: 'pending', urls }
}
