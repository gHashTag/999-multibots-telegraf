/**
 * Render Avatar Video Function
 * Ported from Python render-api-v3: src/services/inngest_services/render_avatar_video.py
 *
 * Orchestrates full workflow:
 * 1. Create job
 * 2. Generate speech audio (Hedra) or avatar (HeyGen)
 * 3. Generate avatar video (Hedra) / Wait for avatar completion
 * 4. Generate transcription from audio
 * 5. Generate B-roll prompts from transcription
 * 6. Generate B-roll videos in parallel
 * 7. Wait for B-roll results in parallel
 * 8. Create job settings JSON
 * 9. Upload settings to S3
 * 10. Trigger render workflow
 */

import { inngest } from '@/inngest_app/client'
import type { RenderAvatarVideoEventData } from './types'
import { NonRetriableError } from 'inngest'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import axios from 'axios'
import { HedraService } from '@/services/hedra'
import { HeyGenService } from '@/services/heygen'
import { ElevenLabsService } from '@/services/elevenLabs'
import { KieAIService } from '@/services/kieAI'
import { validateRenderAvatarVideoEventData } from './schemas'
import { createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'

// ==================== Types ====================

interface BRollSegment {
  id: string
  start: number
  end: number
  prompt: string
}

interface Attachment {
  id: string
  url: string
  object_key: string
  meta_data?: any
}

// ==================== Helper Functions ====================

/**
 * Extract B-roll segments from transcription with word timings
 */
function extractBRollSegments(transcription: any): BRollSegment[] {
  const segments: BRollSegment[] = []

  if (!transcription.words || transcription.words.length === 0) {
    console.warn('No words in transcription for B-roll generation')
    return segments
  }

  const words = transcription.words
  const segmentDuration = 5 // 5 seconds per segment
  let currentStart = 0

  while (currentStart < words[words.length - 1].end) {
    const currentEnd = Math.min(
      currentStart + segmentDuration,
      words[words.length - 1].end
    )

    // Find words in this time range
    const segmentWords = words.filter(
      (w: any) => w.start >= currentStart && w.start < currentEnd
    )

    if (segmentWords.length > 0) {
      const text = segmentWords.map((w: any) => w.text).join(' ')

      segments.push({
        id: `segment_${segments.length}`,
        start: currentStart,
        end: currentEnd,
        prompt: `Cinematic b-roll footage: ${text}. High quality, professional, cinematic lighting.`,
      })
    }

    currentStart = currentEnd
  }

  return segments
}

/**
 * Create job settings JSON for rendering
 */
function createJobSettings(
  avatarAttachment: Attachment,
  brollAttachments: Array<{ segment: BRollSegment; attachment: Attachment }>
): any {
  // Extract avatar duration
  const avatarMeta = avatarAttachment.meta_data || {}
  const avatarDuration =
    avatarMeta.format?.duration || avatarMeta.duration_seconds || 60

  // Create avatar layer
  const avatarLayer = {
    name: 'Avatar',
    type: 'video',
    start_time: 0,
    in_point: 0,
    out_point: avatarDuration,
    footage_url: avatarAttachment.url,
    enabled: true,
  }

  // Create B-roll layers
  const brollLayers = brollAttachments.map((broll, index) => ({
    name: `BRoll_${index + 1}`,
    type: 'video',
    start_time: broll.segment.start,
    in_point: broll.segment.start,
    out_point: broll.segment.end,
    footage_url: broll.attachment.url,
    enabled: true,
  }))

  return {
    composition: {
      name: 'Comp1',
      width: 1080,
      height: 1920,
      duration: avatarDuration,
      frameRate: 30,
    },
    layers: [avatarLayer, ...brollLayers],
    metadata: {
      generated_at: new Date().toISOString(),
      avatar_duration: avatarDuration,
      broll_count: brollLayers.length,
    },
  }
}

/**
 * Upload settings to S3
 */
async function uploadSettingsToS3(
  jobId: string,
  settings: any
): Promise<string> {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  const bucket = process.env.AWS_S3_BUCKET || 'render-api-bucket'
  const key = `jobs/${jobId}/settings.json`

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(settings, null, 2),
      ContentType: 'application/json',
    })
  )

  return `https://${bucket}.s3.amazonaws.com/${key}`
}

// ==================== Main Inngest Function ====================

export const renderAvatarVideoFunction = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'render-avatar-video'.
    id: 'render-avatar-video-run',
    name: '🎥 Render Avatar Video Workflow',
    retries: 3,
    onFailure: createInngestFailureHandler('render-avatar-video-run'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [{ event: 'render/avatar-video.run' }, { event: 'render/avatar-video' }],
  async ({ event, step, logger }) => {
    // Validate event data before processing
    const data = validateRenderAvatarVideoEventData(event.data)

    // Safe mode: the pipeline below calls paid avatar/TTS/LLM providers.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('avatar-video pipeline')
      logger.warn('🛡️ [RENDER AVATAR] safe mode — render skipped', skipped)
      return { success: false, ...skipped }
    }

    logger.info(
      `Starting render-avatar-video workflow for user ${data.user_id}`
    )

    // Step 1: Create job if not provided
    let jobId = data.job_id
    if (!jobId) {
      jobId = await step.run('create-job', async () => {
        const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`
        logger.info(`Created job: ${newJobId}`)
        return newJobId
      })
    }

    let audioUrl: string
    let avatarAttachment: Attachment

    // Steps 2-4: Generate avatar based on service
    if (data.avatar_gen_service === 'hedra') {
      // Step 2a: Generate speech audio for Hedra
      audioUrl = await step.run('generate-speech-audio', async () => {
        logger.info('Generating speech audio with ElevenLabs')

        const elevenLabs = new ElevenLabsService(data.eleven_labs_api_key)
        const audioBuffer = await elevenLabs.generateSpeech({
          text: data.avatar_settings.avatar_speech,
          voice_id: data.avatar_settings.voice_id,
          model_id: 'eleven_multilingual_v2',
        })

        // Upload to S3
        const audioKey = `jobs/${jobId}/speech_audio.mp3`
        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        })

        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: audioKey,
            Body: audioBuffer,
            ContentType: 'audio/mpeg',
          })
        )

        const url = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${audioKey}`
        logger.info(`Uploaded speech audio: ${url}`)
        return url
      })

      // Step 2b: Start Hedra avatar generation
      const hedraGenerationId = await step.run(
        'start-hedra-generation',
        async () => {
          logger.info('Starting Hedra avatar generation')

          const hedra = new HedraService(data.avatar_settings.api_key)

          // Create and upload image asset
          const imageAsset = await hedra.createAsset('avatar_image', 'image')
          await hedra.uploadAsset(
            imageAsset.id,
            data.avatar_settings.avatar_photo_url!
          )

          // Create and upload audio asset
          const audioAsset = await hedra.createAsset('avatar_audio', 'audio')
          await hedra.uploadAsset(audioAsset.id, audioUrl)

          // Start generation
          const generation = await hedra.startGeneration(
            imageAsset.id,
            audioAsset.id,
            'Generate a video with the provided image and audio.'
          )

          logger.info(`Started Hedra generation: ${generation.id}`)
          return generation.id
        }
      )

      // Step 2c: Wait for Hedra completion
      avatarAttachment = (await step.run('wait-hedra-completion', async () => {
        logger.info(`Waiting for Hedra generation: ${hedraGenerationId}`)

        const hedra = new HedraService(data.avatar_settings.api_key)
        const result = await hedra.waitForCompletion(hedraGenerationId)

        if (!result.url) {
          throw new NonRetriableError(
            'Hedra generation did not return video URL'
          )
        }

        return {
          id: `attachment_${Date.now()}`,
          url: result.url!,
          object_key: `jobs/${jobId}/avatar_video.mp4`,
          meta_data: { format: { duration: 60 } },
        } as Attachment
      })) as unknown as Attachment
    } else if (data.avatar_gen_service === 'heygen') {
      // Step 2a: Start HeyGen avatar generation
      const heygenVideoId = await step.run(
        'start-heygen-generation',
        async () => {
          logger.info('Starting HeyGen avatar generation')

          const heygen = new HeyGenService(data.avatar_settings.api_key)
          const result = await heygen.generateAvatarVideo({
            avatar_speech: data.avatar_settings.avatar_speech,
            avatar_id: data.avatar_settings.avatar_id!,
            voice_id: data.avatar_settings.voice_id,
          })

          logger.info(`Started HeyGen generation: ${result.video_id}`)
          return result.video_id
        }
      )

      // Step 2b: Wait for HeyGen completion
      avatarAttachment = (await step.run('wait-heygen-completion', async () => {
        logger.info(`Waiting for HeyGen generation: ${heygenVideoId}`)

        const heygen = new HeyGenService(data.avatar_settings.api_key)
        const result = await heygen.waitForCompletion(heygenVideoId)

        if (!result.video_url) {
          throw new NonRetriableError(
            'HeyGen generation did not return video URL'
          )
        }

        return {
          id: `attachment_${Date.now()}`,
          url: result.video_url!,
          object_key: `jobs/${jobId}/avatar_video.mp4`,
          meta_data: { duration_seconds: result.duration || 60 },
        } as Attachment
      })) as unknown as Attachment

      // HeyGen videos have embedded audio
      audioUrl = avatarAttachment.url
    } else {
      throw new NonRetriableError(
        `Unsupported avatar generation service: ${data.avatar_gen_service}`
      )
    }

    // Step 3: Generate transcription from audio
    const transcription = await step.run('generate-transcription', async () => {
      logger.info('Generating transcription from audio')

      const elevenLabs = new ElevenLabsService(data.eleven_labs_api_key)
      const result = await elevenLabs.transcribeAudioFromUrl(audioUrl)

      logger.info(`Transcription completed: ${result.text.length} characters`)
      return result
    })

    // Step 4: Generate B-roll prompts from transcription
    const brollSegments = await step.run('generate-broll-prompts', async () => {
      logger.info('Extracting B-roll segments from transcription')

      const segments = extractBRollSegments(transcription)

      logger.info(`Generated ${segments.length} B-roll prompts`)
      return segments
    })

    // Step 5: Generate B-roll videos in parallel
    const brollGenerations = (await step.run(
      'generate-brolls-parallel',
      async () => {
        logger.info(
          `Starting parallel generation of ${brollSegments.length} B-roll videos`
        )

        const kieAI = new KieAIService(data.kie_api_key)

        return await Promise.all(
          brollSegments.map(async segment => {
            const seeds = Math.floor(Math.random() * 90000) + 10000

            const result = await kieAI.createVideo({
              prompt: segment.prompt,
              seeds,
            })

            logger.info(
              `B-roll task created for segment ${segment.id}: ${result.taskId}`
            )

            return { segment, task_id: result.taskId }
          })
        )
      }
    )) as unknown as { segment: BRollSegment; task_id: string }[]

    // Step 6: Wait for all B-roll completions in parallel
    const completedBRolls = (await step.run(
      'wait-brolls-completion',
      async () => {
        logger.info(
          `Waiting for ${brollGenerations.length} B-roll videos to complete`
        )

        const kieAI = new KieAIService(data.kie_api_key)

        const completed = await Promise.all(
          brollGenerations.map(async gen => {
            try {
              const result = await kieAI.waitForCompletion(gen.task_id)

              if (!result.video_urls || result.video_urls.length === 0) {
                throw new Error(
                  `No video URLs returned for task ${gen.task_id}`
                )
              }

              return {
                segment: gen.segment,
                attachment: {
                  id: `broll_${gen.segment.id}`,
                  url: result.video_urls[0],
                  object_key: `jobs/${jobId}/broll_${gen.segment.id}.mp4`,
                },
              }
            } catch (error: any) {
              logger.error(
                `B-roll failed for segment ${gen.segment.id}: ${error.message}`
              )
              return null
            }
          })
        )

        const successful = completed.filter(b => b !== null)
        logger.info(
          `${successful.length}/${completed.length} B-rolls completed successfully`
        )

        return successful
      }
    )) as unknown as { segment: BRollSegment; attachment: Attachment }[]

    // Step 7: Create job settings JSON
    const settings = await step.run('create-job-settings', async () => {
      logger.info('Creating job settings JSON')

      const jobSettings = createJobSettings(avatarAttachment, completedBRolls)

      logger.info(
        `Job settings created with ${completedBRolls.length} B-roll layers`
      )
      return jobSettings
    })

    // Step 8: Upload settings to S3
    const settingsUrl = await step.run('upload-settings-to-s3', async () => {
      logger.info('Uploading settings to S3')

      const url = await uploadSettingsToS3(jobId, settings)

      logger.info(`Settings uploaded: ${url}`)
      return url
    })

    // Step 9: Trigger render workflow
    const renderId = await step.run('trigger-render', async () => {
      logger.info('Triggering render workflow')

      const renderId = `render_${Date.now()}`

      // In production, trigger actual render server
      // await axios.post('https://render-server.com/api/render', {
      //   job_id: jobId,
      //   settings_url: settingsUrl,
      //   composition_name: 'Comp1',
      // })

      logger.info(`Render triggered: ${renderId}`)
      return renderId
    })

    logger.info(`✅ Completed render-avatar-video workflow for job ${jobId}`)

    return {
      success: true,
      job_id: jobId,
      render_id: renderId,
      settings_url: settingsUrl,
      avatar_url: avatarAttachment.url,
      broll_count: completedBRolls.length,
    }
  }
)
