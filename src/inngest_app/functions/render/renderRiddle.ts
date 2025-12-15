/**
 * Render Riddle Function
 * Ported from Python render-api-v3: src/services/inngest_services/render_riddle.py
 *
 * COMPLETE IMPLEMENTATION with all 10 steps:
 * 0. Load template JSON from database
 * 1. Create job record
 * 2. Generate speech audio (Hedra) OR start avatar generation (HeyGen)
 * 3. Generate avatar (Hedra) OR wait for avatar completion (HeyGen)
 * 4. Generate transcription from audio
 * 5. Generate B-roll prompts from template timing
 * 6. Generate B-roll videos (parallel)
 * 7. Wait for B-roll results (parallel)
 * 8. Prepare template JSON with asset substitution
 * 9. Upload settings to S3
 * 10. Trigger render
 */

import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { NonRetriableError } from 'inngest'
import type { RenderRiddleEventData } from './types'
import {
  loadTemplateJson,
  createJob,
  generateSpeechAudio,
  generateTranscription,
  generateBrollSegments,
  generateBroll,
  waitForBrollResult,
  uploadTemplateToS3,
  triggerRender,
  startHedraAvatarGeneration,
  waitForHedraAvatarCompletion,
  startHeyGenAvatarGeneration,
  waitForHeyGenAvatarCompletion,
  extractAudioFromHeyGenAvatar,
} from './steps'
import { S3Service } from './helpers/s3.service'
import { processRiddleTemplate, extractBrollLayers } from './helpers/templateProcessor'
import { validateRenderRiddleEventData } from './schemas'
import { detectFacePosition, shouldUseFaceDetection } from './helpers/faceDetection'
import { getHeyGenAvatarDetails, extractPreviewImageUrl } from './helpers/heygenAvatarDetails'

/**
 * Main Render Riddle Inngest Function
 * Matches Python render_riddle_function workflow
 */
export const renderRiddleFunction = inngest.createFunction(
  {
    id: 'render-riddle',
    name: '🧩 Render Riddle Workflow',
    retries: 3,
    // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
    onFailure: createInngestFailureHandler('Render Riddle Workflow'),
  },
  { event: 'render-riddle' },
  async ({ event, step, logger }) => {
    // Validate event data before processing
    const data = validateRenderRiddleEventData(event.data)

    logger.info(`🚀 Starting render-riddle workflow for job ${data.job_id}`)

    const user_id = process.env.DEFAULT_ADMIN_ID || 'default-admin'
    const template_id = 'riddle'
    const composition_name = 'Instagram_Story'

    // ============================================
    // STEP 0: Load template JSON from database
    // ============================================
    const templateJson = await step.run('load-template-json', async () => {
      logger.info(`[Step 0/10] Loading template JSON for ${template_id}`)
      return loadTemplateJson(template_id, logger)
    })

    logger.info(`✅ Template JSON loaded: ${templateJson.length} sections`)

    // ============================================
    // STEP 1: Create job record
    // ============================================
    await step.run('create-job', async () => {
      logger.info(`[Step 1/10] Creating job ${data.job_id}`)
      return createJob(user_id, data.job_id, template_id, logger)
    })

    logger.info(`✅ Job created: ${data.job_id}`)

    // ============================================
    // STEP 2-4: Avatar Generation (Hedra or HeyGen)
    // ============================================
    let avatar: any
    let avatarSpeechUrl: string

    if (data.avatar_gen_service === 'hedra') {
      // HEDRA WORKFLOW: Speech → Avatar
      logger.info(`📢 Using Hedra for avatar generation`)

      // Step 2: Generate speech audio
      avatarSpeechUrl = await step.run('generate-speech-audio', async () => {
        logger.info(`[Step 2/10] Generating speech audio with ElevenLabs`)
        return generateSpeechAudio(
          data.job_id,
          user_id,
          data.avatar_settings.avatar_speech,
          data.avatar_settings.voice_id || 'default-voice',
          data.eleven_labs_api_key,
          logger
        )
      })

      logger.info(`✅ Speech audio generated: ${avatarSpeechUrl}`)

      // Step 3: Start Hedra avatar generation
      const hedraId = await step.run('start-avatar-generation', async () => {
        logger.info(`[Step 3/10] Starting Hedra avatar generation`)
        return startHedraAvatarGeneration(
          data.job_id,
          user_id,
          data.avatar_settings.avatar_photo_url,
          avatarSpeechUrl,
          data.avatar_settings.api_key,
          logger
        )
      })

      logger.info(`✅ Hedra generation started: ${hedraId}`)

      // Step 4: Wait for Hedra avatar completion
      avatar = await step.run('wait-avatar-completion', async () => {
        logger.info(`[Step 4/10] Waiting for Hedra avatar completion`)
        return waitForHedraAvatarCompletion(
          data.job_id,
          user_id,
          hedraId,
          data.avatar_settings.api_key,
          logger
        )
      })

      logger.info(`✅ Hedra avatar completed`)
    } else if (data.avatar_gen_service === 'heygen') {
      // HEYGEN WORKFLOW: Start avatar → Wait → Extract audio
      logger.info(`📢 Using HeyGen for avatar generation`)

      // Step 2: Start HeyGen avatar generation
      const heygenId = await step.run('start-avatar-generation', async () => {
        logger.info(`[Step 2/10] Starting HeyGen avatar generation`)
        return startHeyGenAvatarGeneration(
          data.job_id,
          data.avatar_settings.avatar_speech,
          data.avatar_settings.avatar_id || 'Anna_public_3_20240108',
          data.avatar_settings.voice_id || 'af3f58840d974f1e8c0bb2ffb70fe5ee',
          data.heygen_api_key,
          logger
        )
      })

      logger.info(`✅ HeyGen generation started: ${heygenId}`)

      // Step 3: Wait for HeyGen avatar completion
      avatar = await step.run('wait-avatar-completion', async () => {
        logger.info(`[Step 3/10] Waiting for HeyGen avatar completion`)
        return waitForHeyGenAvatarCompletion(
          data.job_id,
          user_id,
          heygenId,
          data.heygen_api_key,
          logger
        )
      })

      logger.info(`✅ HeyGen avatar completed`)

      // Step 4: Extract audio from HeyGen video
      avatarSpeechUrl = await step.run('extract-avatar-speech-url', async () => {
        logger.info(`[Step 4/10] Extracting audio from HeyGen avatar`)
        return extractAudioFromHeyGenAvatar(
          data.job_id,
          user_id,
          avatar.object_key,
          logger
        )
      })

      logger.info(`✅ Audio extracted from HeyGen avatar`)
    } else {
      throw new NonRetriableError(
        `Unsupported avatar generation service: ${data.avatar_gen_service}`
      )
    }

    // Get avatar duration
    const avatarDuration =
      avatar.meta_data?.format?.duration ||
      avatar.meta_data?.duration_seconds ||
      30.0
    logger.info(`📹 Avatar duration: ${avatarDuration}s`)

    // ============================================
    // STEP 5: Generate transcription
    // ============================================
    const transcription = await step.run('generate-transcription', async () => {
      logger.info(`[Step 5/10] Generating transcription from audio`)
      return generateTranscription(
        data.job_id,
        user_id,
        avatarSpeechUrl,
        data.eleven_labs_api_key,
        logger
      )
    })

    logger.info(`✅ Transcription generated: ${transcription.id}`)

    // ============================================
    // STEP 6: Generate B-roll prompts from template
    // ============================================
    const segments = await step.run('generate-broll-prompts', async () => {
      logger.info(`[Step 6/10] Generating B-roll prompts from template timing`)
      return generateBrollSegments(
        data.job_id,
        user_id,
        transcription,
        templateJson,
        logger
      )
    })

    logger.info(`✅ Generated ${segments.length} B-roll prompts`)

    // ============================================
    // STEP 7: Generate B-roll videos (parallel)
    // ============================================
    logger.info(`[Step 7/10] Generating ${segments.length} B-roll videos in parallel`)

    const generatingBrolls = await Promise.all(
      segments.map((segment, index) =>
        step.run(`generate-broll-${index}`, async () => {
          logger.info(`Generating B-roll ${index + 1}/${segments.length}`)
          return generateBroll(data.kie_api_key, data.job_id, segment, logger)
        })
      )
    )

    logger.info(`✅ All ${segments.length} B-roll videos initiated`)

    // ============================================
    // STEP 8: Wait for B-roll results (parallel)
    // ============================================
    logger.info(`[Step 8/10] Waiting for ${generatingBrolls.length} B-roll results`)

    const brolls = await Promise.all(
      generatingBrolls.map((broll, index) =>
        step.run(`wait-broll-${index}`, async () => {
          logger.info(`Waiting for B-roll ${index + 1}/${generatingBrolls.length}`)
          return waitForBrollResult(broll, user_id, data.job_id, logger)
        })
      )
    )

    logger.info(`✅ All ${brolls.length} B-roll videos completed`)

    // ============================================
    // STEP 9: Prepare template JSON with substitution
    // ============================================
    const settingsUrl = await step.run('prepare-template-json', async () => {
      logger.info(`[Step 9/10] Preparing template JSON with asset substitution`)

      // Get avatar URL (presigned S3 URL)
      const s3Service = new S3Service()
      const avatarUrl = await s3Service.generateGetUrl(avatar.object_key)
      logger.info(`✅ Generated avatar presigned URL`)

      // Prepare B-roll data with presigned URLs
      const brollData = await Promise.all(
        brolls.map(async (broll) => ({
          layer_id: broll.broll_segment.layer_id || '',
          url: await s3Service.generateGetUrl(broll.attachment.object_key),
        }))
      )
      logger.info(`✅ Generated ${brollData.length} B-roll presigned URLs`)

      // Face detection for circle positioning (optional)
      let facePosition: { position: [number, number, number]; anchor_point: [number, number, number]; scale: [number, number, number] } | undefined

      if (shouldUseFaceDetection(data.circle_position, data.circle_scale)) {
        logger.info(`🔍 Face detection enabled for automatic circle positioning`)

        // Get avatar photo URL based on service
        let avatarPhotoUrl: string | null = null

        if (data.avatar_gen_service === 'hedra') {
          avatarPhotoUrl = data.avatar_settings.avatar_photo_url || null
        } else if (data.avatar_gen_service === 'heygen' && data.heygen_api_key) {
          try {
            const avatarDetails = await getHeyGenAvatarDetails(
              data.heygen_api_key,
              data.avatar_settings.avatar_id || '',
              logger
            )
            avatarPhotoUrl = extractPreviewImageUrl(avatarDetails)
            logger.info(`✅ Retrieved HeyGen avatar preview image URL`)
          } catch (error: any) {
            logger.error(`Failed to get HeyGen avatar details: ${error.message}`)
          }
        }

        // Perform face detection if we have photo URL
        if (avatarPhotoUrl) {
          try {
            const composition = {
              size: { width: 1080, height: 1920 },
              circle: { position: [680, 1550, 0] as [number, number, number], radius: 275 },
            }

            facePosition = await detectFacePosition(avatarPhotoUrl, composition, logger)
            logger.info(`✅ Face position detected: position=${facePosition.position}, anchor=${facePosition.anchor_point}, scale=${facePosition.scale}`)
          } catch (error: any) {
            logger.error(`Face detection failed, using default position: ${error.message}`)
          }
        } else {
          logger.warn(`No avatar photo URL available for face detection`)
        }
      }

      // Process template with all substitutions
      const processedTemplate = processRiddleTemplate(
        templateJson,
        {
          avatarUrl,
          avatarDuration,
          coverUrl: data.cover_url,
          introText1: data.intro_text_1,
          introText2: data.intro_text_2,
          circlePosition: facePosition?.position || data.circle_position,
          circleScale: facePosition?.scale || data.circle_scale,
          circleAnchorPoint: facePosition?.anchor_point,
          brollData,
        },
        logger
      )

      // Upload to S3
      return uploadTemplateToS3(data.job_id, processedTemplate, logger)
    })

    logger.info(`✅ Template JSON uploaded: ${settingsUrl}`)

    // ============================================
    // STEP 10: Trigger render
    // ============================================
    const renderId = await step.run('trigger-render', async () => {
      logger.info(`[Step 10/10] Triggering render for job ${data.job_id}`)
      return triggerRender(
        data.job_id,
        template_id,
        settingsUrl,
        'update',
        composition_name,
        data.callback_url,
        logger
      )
    })

    logger.info(`✅ Render triggered: ${renderId}`)

    // ============================================
    // WORKFLOW COMPLETE
    // ============================================
    logger.info(`✨ Completed render-riddle workflow for job ${data.job_id}`)

    return {
      success: true,
      job_id: data.job_id,
      render_id: renderId,
      settings_url: settingsUrl,
      template_id,
      composition_name,
      avatar_duration: avatarDuration,
      broll_count: brolls.length,
    }
  }
)

/**
 * Helper function to trigger render-riddle workflow
 * Matches Python trigger_render_riddle function
 */
export async function triggerRenderRiddle(eventData: RenderRiddleEventData) {
  const { inngest } = await import('@/inngest_app/client')
  const { v4: uuid } = await import('uuid')

  await inngest.send({
    id: `render-riddle/${uuid()}`,
    name: 'render-riddle',
    data: eventData,
  })
}
