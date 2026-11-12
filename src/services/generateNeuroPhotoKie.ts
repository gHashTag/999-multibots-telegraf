import axios from 'axios'
import { logger } from '@/utils/logger'
import { KIE_AI_API_KEY } from '@/config'
import { KIE_JOBS, readKieJobRecord } from '@/config/kie-jobs'

// NeuroPhoto text-to-image through kie.ai -- the one provider left standing
// (owner's kie-only rule, 2026-10-02). The fal/Replicate pair this replaces
// was measured dead on 2026-10-03: fal balance 0.0, Replicate account
// disabled (402). Every attempt to route back to them is the defect.

// Measured T2I model on kie.ai (render/src/agent/kie-run.ts registry):
// serves reliably, 4 credits, honours an exact `aspect_ratio`. gpt-image-2.5
// is the img2img/brand tool; for plain prompt-to-photo nano-banana is the
// cheaper measured servant.
const T2I_MODEL = 'google/nano-banana'

const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 180000

/**
 * One image from a prompt, via the kie.ai Jobs API.
 *
 * Payment is NOT handled here: callers charge before calling and refund in
 * their own catch (see generateNeuroPhotoDirect). This function only turns a
 * prompt into a URL, or throws with the reason.
 *
 * Paths and the record shape come from src/config/kie-jobs.ts -- three older
 * pollers in this repository died polling a sibling path that does not exist,
 * so the path is never spelled out by hand here.
 */
export async function generateNeuroPhotoViaKie(
  prompt: string,
  aspectRatio: string
): Promise<string> {
  if (!KIE_AI_API_KEY) {
    throw new Error('KIE_AI_API_KEY not configured')
  }

  const created = await axios.post(
    `${KIE_JOBS.BASE_URL}${KIE_JOBS.CREATE_TASK}`,
    {
      model: T2I_MODEL,
      // aspect_ratio must be explicit: the API default is landscape, and a
      // neurophoto is looked at on a phone.
      input: { prompt, aspect_ratio: aspectRatio },
    },
    {
      headers: {
        Authorization: `Bearer ${KIE_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  )

  if (created.data?.code !== 200 || !created.data?.data?.taskId) {
    throw new Error(
      `kie.ai createTask failed: ${created.data?.msg || 'no taskId returned'}`
    )
  }

  const taskId: string = created.data.data.taskId
  logger.info('[NeuroPhotoKie] Task created', { taskId, aspectRatio })

  const startedAt = Date.now()
  let imageUrl = ''

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    const status = await axios.get(
      `${KIE_JOBS.BASE_URL}${KIE_JOBS.RECORD_INFO}`,
      {
        params: { taskId },
        headers: { Authorization: `Bearer ${KIE_AI_API_KEY}` },
        timeout: 20000,
      }
    )

    const record = readKieJobRecord(status.data?.data)

    if (record.state === 'fail') {
      throw new Error(record.failMsg || 'kie.ai neurophoto job failed')
    }
    if (record.state === 'success') {
      imageUrl = record.urls[0]
      break
    }
  }

  if (!imageUrl) {
    // Credits were already spent the moment createTask answered -- the job
    // may still finish behind this timeout, so the taskId goes into the
    // message: it is the only handle for a manual recovery.
    throw new Error(
      `kie.ai neurophoto did not finish within ${
        MAX_WAIT_MS / 1000
      }s (taskId ${taskId})`
    )
  }

  logger.info('[NeuroPhotoKie] Image ready', {
    taskId,
    waitedMs: Date.now() - startedAt,
  })

  return imageUrl
}
