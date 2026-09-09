/**
 * Render Function
 * Ported from Python render-api-v3: src/services/inngest_services/render.py
 * Python function name: render_function()
 *
 * This function runs in the background when it receives the 'render' event.
 * Performs the complete video rendering workflow using Inngest steps:
 * 1. Create job folder on remote server
 * 2. Download template and build job.json
 * 3. Execute nexrender-cli on remote server
 * 4. Upload result to S3
 * 5. Send callback (optional)
 *
 * Event data required:
 * - job_id: Unique job identifier
 * - template_url: URL to download template.aep
 * - job_json_url: URL to download job.json parameters
 * - composition_name: Name of the composition to render
 * - render_type: Type of render ('create' or 'update')
 * - server_url: Render server hostname
 * - server_port: SSH port
 * - server_user: SSH username
 * - callback_url: Optional callback URL
 */

import { inngest } from '@/inngest_app/client'
import type { RenderEventData } from './types'
import {
  createJobFolder,
  downloadFiles,
  renderFunction as executeRender,
  uploadToS3,
  sendCallback,
} from './helpers/renderSteps'
import { validateRenderEventData } from './schemas'
import { createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'

export const renderFunction = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'render' (Python fn_id).
    id: 'render-job-run',
    name: '🎬 Render Workflow',
    retries: 3,
    onFailure: createInngestFailureHandler('render-job-run'),
  },
  // Canonical event first, legacy event 'render' (Python) kept for senders.
  [{ event: 'render/job.run' }, { event: 'render' }],
  async ({ event, step, logger }) => {
    // Validate event data before processing
    const eventData = validateRenderEventData(event.data)

    // Safe mode: the pipeline below calls paid TTS/LLM/render providers.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('render pipeline')
      logger.warn('🛡️ [RENDER] safe mode — render skipped', skipped)
      return { success: false, ...skipped }
    }
    const { job_id, callback_url } = eventData

    logger.info('Starting render workflow', {
      job_id,
      server: eventData.server_url,
      renderType: eventData.render_type,
    })

    // Step 1: Create job folder on remote server
    await step.run('create-job-folder', async () => {
      logger.info(`[Step 1/4] Creating job folder for job ${job_id}`)
      return createJobFolder(eventData as RenderEventData, logger)
    })

    // Step 2: Download files (template, build job.json)
    await step.run('download-files', async () => {
      logger.info(`[Step 2/4] Downloading files for job ${job_id}`)
      return downloadFiles(eventData as RenderEventData, logger)
    })

    // Step 3: Execute render on remote server
    await step.run('render', async () => {
      logger.info(`[Step 3/4] Rendering job ${job_id}`)
      return executeRender(eventData as RenderEventData, logger)
    })

    // Step 4: Upload result to S3
    const uploadResult = await step.run('upload-to-s3', async () => {
      logger.info(`[Step 4/4] Uploading result to S3 for job ${job_id}`)
      return uploadToS3(eventData as RenderEventData, logger)
    })

    // Step 5: Send callback if provided (optional, don't fail workflow if it fails)
    if (callback_url) {
      try {
        await step.run('callback', async () => {
          logger.info(`Sending callback for job ${job_id}`)
          return sendCallback(callback_url, uploadResult.downloadUrl, logger)
        })
      } catch (callbackError) {
        logger.error(`Callback failed for job ${job_id}:`, callbackError)
        // Continue - callback failure should not fail the workflow
      }
    }

    logger.info(`✅ Render workflow completed successfully for job ${job_id}`)
    logger.info(`📹 Result URL: ${uploadResult.downloadUrl.split('?')[0]}`)

    return uploadResult.downloadUrl
  }
)
