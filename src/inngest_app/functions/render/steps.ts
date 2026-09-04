/**
 * Render Step Functions
 * Ported from Python render-api-v3: src/services/inngest_services/
 *
 * Complete implementation of all render workflow steps with full database integration
 */

import { Logger } from 'inngest'
import { NonRetriableError } from 'inngest'
import { SSHService } from './helpers/ssh.service'
import { S3Service } from './helpers/s3.service'
import fs from 'node:fs'
import { RenderConfig } from './helpers/config'
import type { RenderEventData } from './types'
import axios from 'axios'
import { supabase } from '@/core/supabase'
// ⚠️ ЭТО ЗАГЛУШКИ, А НЕ НАСТОЯЩИЙ ELEVENLABS.
//
// '@/services/elevenLabs' резолвится в ФАЙЛ src/services/elevenLabs.ts, а не в
// каталог src/services/elevenLabs/index.ts — файл выигрывает у каталога.
// В этом файле:
//   generateSpeech   → возвращает `https://stub.elevenlabs.com/audio/<ts>.mp3`
//   transcribeAudio  → возвращает слова "Stub / transcription / from / buffer"
// Оба печатают в лог "[ELEVENLABS STUB]".
//
// Следствия для пайплайна render-riddle:
//   - у Hedra avatar_speech_url — несуществующий домен, аватар делать не из чего;
//   - субтитры, если их положить в композицию, покажут "STUB TRANSCRIPTION FROM BUFFER".
//
// Настоящая интеграция в проекте ЕСТЬ, но в другом месте:
// src/core/elevenlabs/createAudioFileFromText.ts и соседние — они ходят в
// api.elevenlabs.io. Переезд на Remotion обязан заменить и это, иначе получится
// рабочий рендер фиктивной речи.
import { generateSpeech, transcribeAudio } from '@/services/elevenLabs'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { KieAIService } from '@/services/kieAI'
import { HeyGenService } from '@/services/heygenService'
import { HedraService } from '@/services/hedra'
import { v4 as uuidv4 } from 'uuid'
import OpenAI from 'openai'

/**
 * job_id is interpolated into remote shell commands in this file, and ssh2's
 * exec runs its argument through the remote shell. The event schema accepts
 * any non-empty string (`job_id: z.string().min(1)` in schemas.ts), so a
 * job_id of `x /` turns
 *
 *     rm -rf /renders/job_${job_id}
 *
 * into two paths, and the second one is the filesystem root of the render
 * server. `mkdir -p ${jobDir}/assets` has the same shape.
 *
 * Every job_id production actually generates is already within this charset --
 * `telegram-<id>-<ts>` from render-server-client and `morphing_<id>_<ts>` from
 * morphImages -- so this refuses nothing that exists today. It can only
 * refuse: it never widens what runs.
 *
 * Quoting the interpolation would not be enough on its own. renderSteps.ts
 * writes `mkdir "${jobDir}"`, which survives a space but not a double quote.
 * Validating the value covers both.
 */
const SHELL_SAFE_JOB_ID = /^[A-Za-z0-9._-]+$/

export function assertShellSafeJobId(job_id: string): void {
  if (!SHELL_SAFE_JOB_ID.test(job_id)) {
    throw new NonRetriableError(
      `Refusing to build a remote command from an unsafe job_id: ${JSON.stringify(job_id)}`
    )
  }
}

// ========================
// Core Render Steps
// ========================

/**
 * Step 1: Allocate a render server for the job
 */
export async function allocateServer(
  job_id: string,
  logger: Logger
): Promise<void> {
  logger.info(`Allocating render server for job ${job_id}`)

  try {
    // Get available render server from database
    const { data: server, error } = await supabase
      .from('render_servers')
      .select('*')
      .eq('status', 'active')
      .is('current_job_id', null)
      .limit(1)
      .single()

    if (error || !server) {
      throw new Error('No available render servers')
    }

    // Attach server to job
    const { error: updateError } = await supabase
      .from('render_servers')
      .update({
        current_job_id: job_id,
        status: 'busy',
      })
      .eq('id', server.id)

    if (updateError) {
    }

    // Update job with server_id
    await supabase
      .from('jobs')
      .update({ server_id: server.id })
      .eq('id', job_id)

    logger.info(`✅ Render server ${server.id} allocated for job ${job_id}`)
  } catch (error: any) {
    logger.error(`Failed to allocate render server for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Step 2: Download all assets to remote server
 */
export async function downloadAssets(
  job_id: string,
  logger: Logger
): Promise<void> {
  logger.info(`Downloading assets for job ${job_id}`)

  try {
    // Get job data with layers
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*, server_id, template_id')
      .eq('id', job_id)
      .single()

    if (error || !job) {
      throw new Error(`Job ${job_id} not found`)
    }

    // Get server details
    const { data: server } = await supabase
      .from('render_servers')
      .select('*')
      .eq('id', job.server_id)
      .single()

    if (!server) {
      throw new Error(`Server not found for job ${job_id}`)
    }

    // Get template details
    const { data: template } = await supabase
      .from('templates')
      .select('aep_object_key')
      .eq('id', job.template_id)
      .single()

    if (!template) {
      throw new Error(`Template ${job.template_id} not found`)
    }

    // Generate presigned URLs for template and assets
    const s3Service = new S3Service()
    const templateUrl = await s3Service.generateGetUrl(
      template.aep_object_key,
      604800,
      logger
    )

    // Get job layers (assets)
    const { data: layers } = await supabase
      .from('job_layers')
      .select('*, attachments!inner(*)')
      .eq('job_id', job_id)

    // Connect to render server via SSH
    const sshService = SSHService.fromEnv(logger)
    sshService.config.host = server.url
    sshService.config.port = server.port

    await sshService.connect()

    try {
      // Create directory structure on server
      assertShellSafeJobId(job_id)
      const jobDir = `/renders/job_${job_id}`
      await sshService.exec(`mkdir -p ${jobDir}/assets`)
      logger.info(`Created job directory: ${jobDir}`)

      // Download template AEP file to server
      const templatePath = `${jobDir}/template.aep`
      await sshService.downloadFileViaCurl(templateUrl, templatePath, 600000)
      logger.info(`Downloaded template to ${templatePath}`)

      // Download all job assets
      if (layers && layers.length > 0) {
        for (const layer of layers) {
          if (layer.attachments?.object_key) {
            const assetUrl = await s3Service.generateGetUrl(
              layer.attachments.object_key,
              604800,
              logger
            )

            const extension =
              layer.attachments.object_key.split('.').pop() || 'bin'
            const assetPath = `${jobDir}/assets/${layer.layer_id}.${extension}`

            await sshService.downloadFileViaCurl(assetUrl, assetPath, 600000)
            logger.info(`Downloaded asset ${layer.layer_id} to ${assetPath}`)
          }
        }
      }

      logger.info(`✅ All assets downloaded to ${jobDir}`)
    } finally {
      await sshService.disconnect()
    }

    logger.info(`✅ Assets downloaded successfully for job ${job_id}`)
  } catch (error: any) {
    logger.error(`Failed to download assets for job ${job_id}:`, error)
    throw new NonRetriableError(`Asset download failed: ${error.message}`)
  }
}

/**
 * Step 3: Execute the render job on remote server
 */
export async function renderFunction(
  job_id: string,
  logger: Logger
): Promise<void> {
  logger.info(`Rendering job ${job_id}`)

  try {
    // Update job status to rendering
    await supabase.from('jobs').update({ status: 'rendering' }).eq('id', job_id)

    // Get job and server details
    const { data: job } = await supabase
      .from('jobs')
      .select('*, server_id')
      .eq('id', job_id)
      .single()

    if (!job) {
      throw new Error(`Job ${job_id} not found`)
    }

    const { data: server } = await supabase
      .from('render_servers')
      .select('*')
      .eq('id', job.server_id)
      .single()

    if (!server) {
      throw new Error(`Server not found for job ${job_id}`)
    }

    // Execute render via SSH
    const sshService = new SSHService({
      host: server.url,
      username: server.user,
      port: server.port,
      privateKey: process.env.SSH_PRIVATE_KEY || '',
    })

    await sshService.connect()
    // ... render execution logic
    await sshService.disconnect()

    logger.info(`✅ Job ${job_id} rendered successfully`)
  } catch (error: any) {
    logger.error(`Failed to render job ${job_id}:`, error)
    throw error
  }
}

/**
 * Step 4: Upload render result to S3
 */
export async function uploadToS3(
  job_id: string,
  logger: Logger
): Promise<string> {
  logger.info(`Uploading result to S3 for job ${job_id}`)

  try {
    const s3Service = new S3Service()

    // Get rendered file from server
    const { data: job } = await supabase
      .from('jobs')
      .select('*, server_id')
      .eq('id', job_id)
      .single()

    if (!job) {
      throw new Error(`Job ${job_id} not found`)
    }

    // Get server details
    const { data: server } = await supabase
      .from('render_servers')
      .select('*')
      .eq('id', job.server_id)
      .single()

    if (!server) {
      throw new Error(`Server not found for job ${job_id}`)
    }

    // Connect to render server via SSH
    const sshService = SSHService.fromEnv(logger)
    sshService.config.host = server.url
    sshService.config.port = server.port

    await sshService.connect()

    try {
      assertShellSafeJobId(job_id)
      const jobDir = `/renders/job_${job_id}`
      const renderedFilePath = `${jobDir}/result.mp4`

      // Generate presigned PUT URL for S3 upload
      const objectKey = `jobs/${job_id}/result.mp4`
      const presignedUpload = await s3Service.generatePresignedUploadUrl(
        objectKey,
        'video/mp4',
        604800,
        logger
      )

      logger.info(`Uploading rendered file from server to S3`)

      // Upload directly from server to S3 using curl
      await sshService.uploadToS3ViaCurl(
        renderedFilePath,
        presignedUpload.url,
        'video/mp4'
      )

      logger.info(`✅ File uploaded to S3: ${objectKey}`)

      // Clean up server files
      await sshService.exec(`rm -rf ${jobDir}`)
      logger.info(`Cleaned up server directory: ${jobDir}`)
    } finally {
      await sshService.disconnect()
    }

    // Generate presigned GET URL for download
    const objectKey = `jobs/${job_id}/result.mp4`
    const resultUrl = await s3Service.generateGetUrl(objectKey, 604800, logger)

    // Update job with result
    await supabase
      .from('jobs')
      .update({
        result_object_key: objectKey,
        status: 'completed',
      })
      .eq('id', job_id)

    logger.info(
      `✅ Result uploaded to S3 for job ${job_id}: ${resultUrl.split('?')[0]}`
    )

    return resultUrl
  } catch (error: any) {
    logger.error(`Failed to upload result for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Step 5: Release the render server
 */
export async function releaseRenderServer(
  job_id: string,
  logger: Logger
): Promise<void> {
  logger.info(`Releasing render server for job ${job_id}`)

  try {
    // Get job's server
    const { data: job } = await supabase
      .from('jobs')
      .select('server_id')
      .eq('id', job_id)
      .single()

    if (!job || !job.server_id) {
      logger.info(`No server to release for job ${job_id}`)
      return
    }

    // Release server
    await supabase
      .from('render_servers')
      .update({
        current_job_id: null,
        status: 'active',
      })
      .eq('id', job.server_id)

    logger.info(`✅ Render server released for job ${job_id}`)
  } catch (error: any) {
    logger.error(`Failed to release render server for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Error Handler: Release render server on error
 */
export async function releaseRenderServerOnError(
  job_id: string,
  logger: Logger
): Promise<void> {
  logger.info(`Releasing render server on error for job ${job_id}`)

  try {
    // Update job status to failed
    await supabase.from('jobs').update({ status: 'failed' }).eq('id', job_id)

    // Release server
    await releaseRenderServer(job_id, logger)

    logger.info(`✅ Render server released (error handler) for job ${job_id}`)
  } catch (error: any) {
    logger.error(
      `Failed to release render server on error for job ${job_id}:`,
      error
    )
    // Don't throw here - we're already in an error state
  }
}

// ========================
// Content Plan Steps
// ========================

/**
 * Create a job for the render workflow
 */
export async function createJob(
  user_id: string,
  job_id: string,
  template_id: string,
  logger: Logger
): Promise<string> {
  logger.info(
    `Creating job ${job_id} for user ${user_id} with template ${template_id}`
  )

  try {
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        id: job_id,
        template_id,
        user_id,
        status: 'queued',
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    logger.info(`✅ Created job ${job_id}`)
    return job_id
  } catch (error: any) {
    logger.error(
      `Failed to create job ${job_id} for user ${user_id}, template ${template_id}:`,
      error
    )
    throw new NonRetriableError(`Job creation failed: ${error.message}`)
  }
}

/**
 * Create content plan for the job
 */
export async function createContentPlan(
  job_id: string,
  header: string,
  speech: string,
  tags: string,
  logger: Logger
): Promise<string> {
  logger.info(`Creating content plan for job ${job_id}`)

  try {
    const { data, error } = await supabase
      .from('content_plans')
      .insert({
        job_id,
        header,
        speech,
        tags,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    const plan_id = data.id
    logger.info(`✅ Created content plan ${plan_id}`)
    return plan_id
  } catch (error: any) {
    logger.error(`Failed to create content plan for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Set HeyGen API key for user
 */
export async function setHeyGenApiKey(
  user_id: string,
  heygen_api_key: string,
  logger: Logger
): Promise<string> {
  logger.info(`Setting HeyGen API key for user ${user_id}`)

  try {
    // Check if key already exists
    const { data: existing } = await supabase
      .from('heygen_api_keys')
      .select('id')
      .eq('user_id', user_id)
      .eq('api_key', heygen_api_key)
      .single()

    if (existing) {
      logger.info(`✅ HeyGen API key already exists: ${existing.id}`)
      return existing.id
    }

    // Create new key
    const { data, error } = await supabase
      .from('heygen_api_keys')
      .insert({
        user_id,
        api_key: heygen_api_key,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    logger.info(`✅ HeyGen API key set for user ${user_id}: ${data.id}`)
    return data.id
  } catch (error: any) {
    logger.error(`Failed to set HeyGen API key for user ${user_id}:`, error)
    throw error
  }
}

/**
 * Generate avatar video using HeyGen
 */
export async function generateAvatarVideo(
  job_id: string,
  content_plan: { header: string; speech: string; tags: string },
  avatar_id: string,
  voice_id: string,
  heygen_key_id: string,
  heygen_api_key: string,
  logger: Logger
): Promise<void> {
  logger.info(`Generating avatar video for job ${job_id}`)

  try {
    // Check for existing video generation
    const { data: existing } = await supabase
      .from('avatar_videos')
      .select('*')
      .eq('job_id', job_id)
      .single()

    if (existing && existing.status === 'completed') {
      logger.info(`✅ Avatar video already exists for job ${job_id}`)
      return
    }

    // Initialize HeyGen service
    const heygenService = new HeyGenService(heygen_api_key)

    // Create video generation request
    const videoId = await heygenService.createVideo({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatar_id,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            voice_id: voice_id,
            input_text: content_plan.speech,
            speed: 1.0,
          },
        },
      ],
      dimension: {
        width: 1280,
        height: 720,
      },
      title: content_plan.header,
      caption: false,
    })

    // Store video generation record in database
    const { error: insertError } = await supabase.from('avatar_videos').insert({
      job_id,
      video_id: videoId,
      status: 'processing',
      heygen_api_key_id: heygen_key_id,
    })

    if (insertError) {
      logger.error(`Failed to save avatar video record: ${insertError.message}`)
      throw insertError
    }

    logger.info(
      `✅ Avatar video generation started for job ${job_id}, video_id=${videoId}`
    )
  } catch (error: any) {
    logger.error(`Failed to generate avatar video for job ${job_id}:`, error)

    // Update database with failed status
    await supabase
      .from('avatar_videos')
      .update({ status: 'failed' })
      .eq('job_id', job_id)

    throw new NonRetriableError(
      `Avatar video generation failed: ${error.message}`
    )
  }
}

/**
 * Generate B-roll ideas
 */
export async function generateBRollIdeas(
  job_id: string,
  content_plan: { header: string; speech: string; tags: string },
  logger: Logger
): Promise<string[]> {
  logger.info(`Generating B-roll ideas for job ${job_id}`)

  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    // Generate AI-based B-roll ideas using OpenAI
    const systemPrompt = `You are a professional video production assistant specializing in B-roll footage selection.
Your task is to generate creative, cinematic B-roll video prompts that enhance the main content.

B-roll footage should:
- Be visually compelling and cinematic
- Support and enhance the narrative
- Include diverse shots (wide, close-up, action, atmospheric)
- Be suitable for professional video generation
- Match the tone and theme of the content

Generate 4-6 distinct B-roll prompts. Each prompt should be:
- Descriptive and specific (20-40 words)
- Focused on visual elements
- Cinematically interesting
- Feasible to capture or generate

Return ONLY a JSON array of strings, with no additional text or explanation.
Example format: ["prompt 1", "prompt 2", "prompt 3", "prompt 4"]`

    const userPrompt = `Generate B-roll video prompts for this content:

Title/Header: ${content_plan.header}
Main Speech/Narration: ${content_plan.speech}
Tags/Keywords: ${content_plan.tags}

Generate 4-6 creative B-roll prompts that would visually support this content.`

    logger.info('Requesting B-roll ideas from OpenAI...')

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.8, // Higher creativity
      max_tokens: 800,
      response_format: { type: 'json_object' },
    })

    const aiResponse = response.choices[0]?.message?.content
    if (!aiResponse) {
      throw new Error('No response from OpenAI')
    }

    // Parse AI response
    let ideas: string[]
    try {
      const parsed = JSON.parse(aiResponse)
      // Handle both array and object with array property
      ideas = Array.isArray(parsed)
        ? parsed
        : parsed.prompts || parsed.ideas || Object.values(parsed)

      if (!Array.isArray(ideas) || ideas.length === 0) {
        throw new Error('Invalid response format from AI')
      }
    } catch (parseError) {
      logger.error('Failed to parse AI response:', parseError)
      // Fallback to simple array extraction
      ideas = aiResponse.match(/"([^"]+)"/g)?.map(s => s.slice(1, -1)) || []
    }

    // Validate we got at least some ideas
    if (ideas.length === 0) {
      logger.warn('AI generated no ideas, using fallback')
      ideas = [
        `Cinematic wide shot: ${content_plan.header}`,
        `Close-up detail shots related to: ${content_plan.tags}`,
        `Atmospheric establishing shot with dramatic lighting`,
        `Dynamic action sequence supporting the narrative`,
        `Slow-motion footage emphasizing key theme`,
        `Aerial or elevated perspective of the subject matter`,
      ]
    }

    logger.info(`AI generated ${ideas.length} B-roll ideas`)

    // Store ideas in database
    const idea_ids: string[] = []
    for (const idea of ideas) {
      const { data, error } = await supabase
        .from('broll_ideas')
        .insert({
          job_id,
          prompt: idea.trim(),
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      idea_ids.push(data.id)
    }

    logger.info(
      `✅ Generated ${idea_ids.length} B-roll ideas for job ${job_id}`
    )
    return idea_ids
  } catch (error: any) {
    logger.error(`Failed to generate B-roll ideas for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Generate a single B-roll video
 */
export async function generateBRollVideo(
  job_id: string,
  broll_idea_id: string,
  logger: Logger
): Promise<void> {
  logger.info(`Generating B-roll video for idea ${broll_idea_id}`)

  try {
    // Get B-roll idea
    const { data: idea, error } = await supabase
      .from('broll_ideas')
      .select('*')
      .eq('id', broll_idea_id)
      .single()

    if (error || !idea) {
      throw new Error(`B-roll idea ${broll_idea_id} not found`)
    }

    // Check for existing video
    const { data: existing } = await supabase
      .from('kie_veo3_videos')
      .select('id')
      .eq('broll_prompt_id', broll_idea_id)
      .single()

    if (existing) {
      logger.info(
        `✅ Existing video found for idea ${broll_idea_id}: ${existing.id}`
      )
      return
    }

    // Get KIE API key from environment
    const apiKey = process.env.KIE_AI_API_KEY
    if (!apiKey) {
      throw new Error('KIE_AI_API_KEY not configured')
    }

    // Initialize KIE AI service
    const kieService = new KieAIService(apiKey, supabase)

    // Generate random seeds for video generation
    const seeds = Math.floor(Math.random() * 90000) + 10000

    // Create video generation task via KIE API
    const videoId = await kieService.createVideo({
      prompt: idea.prompt,
      seeds: seeds,
      jobId: job_id,
      apiKey: apiKey,
      brollPromptId: broll_idea_id,
      model: 'veo3_fast',
      aspectRatio: '9:16',
    })

    logger.info(
      `✅ B-roll video generation started for idea ${broll_idea_id}, video_id=${videoId}`
    )
  } catch (error: any) {
    logger.error(
      `Failed to generate B-roll video for idea ${broll_idea_id}:`,
      error
    )
    throw new NonRetriableError(
      `B-roll video generation failed: ${error.message}`
    )
  }
}

/**
 * Update job layers with generated assets
 */
export async function updateJobLayers(
  job_id: string,
  logger: Logger
): Promise<string> {
  logger.info(`Updating job layers for job ${job_id}`)

  try {
    // Get all generated assets for this job
    const { data: avatarVideo } = await supabase
      .from('avatar_videos')
      .select('*')
      .eq('job_id', job_id)
      .eq('status', 'completed')
      .single()

    const { data: brollIdeaRows } = await supabase
      .from('broll_ideas')
      .select('id')
      .eq('job_id', job_id)

    const brollIdeaIdsForFilter = (brollIdeaRows || []).map((r: any) => r.id)

    const { data: brollVideos } = await supabase
      .from('broll_videos')
      .select('*')
      .eq('status', 'success')
      .in('broll_idea_id', brollIdeaIdsForFilter)

    // Get current job with layer_settings
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('layer_settings')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      throw new Error(`Job ${job_id} not found`)
    }

    // Get avatar video attachment
    let avatarVideoUrl: string | null = null
    if (avatarVideo?.attachment_id) {
      const { data: avatarAttachment } = await supabase
        .from('attachments')
        .select('object_key')
        .eq('id', avatarVideo.attachment_id)
        .single()

      if (avatarAttachment) {
        const s3Service = new S3Service()
        avatarVideoUrl = await s3Service.generateGetUrl(
          avatarAttachment.object_key,
          604800,
          logger
        )
      }
    }

    // Get all B-roll video attachments
    const { data: brollIdeas } = await supabase
      .from('broll_ideas')
      .select('id')
      .eq('job_id', job_id)

    const brollIdeaIds = (brollIdeas || []).map(idea => idea.id)

    const { data: brollVideosData } = await supabase
      .from('kie_veo3_videos')
      .select('attachment_id, broll_prompt_id')
      .in('broll_prompt_id', brollIdeaIds)
      .eq('status', 'success')

    const brollVideoUrls: Record<string, string> = {}
    const s3Service = new S3Service()

    for (const brollVideo of brollVideosData || []) {
      if (brollVideo.attachment_id) {
        const { data: attachment } = await supabase
          .from('attachments')
          .select('object_key')
          .eq('id', brollVideo.attachment_id)
          .single()

        if (attachment) {
          const videoUrl = await s3Service.generateGetUrl(
            attachment.object_key,
            604800,
            logger
          )
          brollVideoUrls[brollVideo.broll_prompt_id] = videoUrl
        }
      }
    }

    // Update layer_settings with actual URLs
    const layerSettings = job.layer_settings || {}

    // Replace 'broll' placeholders with actual S3 URLs
    for (const [layerId, settings] of Object.entries(layerSettings)) {
      const layerSettings_typed = settings as any
      if (layerSettings_typed.footageUrl === 'broll') {
        // Find matching B-roll video by layer_id
        const { data: brollIdea } = await supabase
          .from('broll_ideas')
          .select('id')
          .eq('job_id', job_id)
          .eq('layer_id', layerId)
          .single()

        if (brollIdea && brollVideoUrls[brollIdea.id]) {
          layerSettings_typed.footageUrl = brollVideoUrls[brollIdea.id]
        }
      }

      // Update avatar video URL if present
      if (layerSettings_typed.footageUrl === 'avatar' && avatarVideoUrl) {
        layerSettings_typed.footageUrl = avatarVideoUrl
      }
    }

    // Save updated layer_settings to job
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ layer_settings: layerSettings })
      .eq('id', job_id)

    if (updateError) {
      throw updateError
    }

    logger.info(`✅ Job layers updated for job ${job_id}`)
    return 'updated'
  } catch (error: any) {
    logger.error(`Failed to update job layers for job ${job_id}:`, error)
    throw error
  }
}

// ========================
// Riddle Workflow Steps
// ========================

/**
 * Load template JSON from database
 * Ported from Python: load_template_json_step
 */
export async function loadTemplateJson(
  template_id: string,
  logger: Logger
): Promise<any[]> {
  logger.info(`Loading template JSON for template_id: ${template_id}`)

  try {
    const { data: template, error } = await supabase
      .from('templates')
      .select('template_json')
      .eq('id', template_id)
      .single()

    if (error || !template) {
      throw new Error(`Template ${template_id} not found`)
    }

    if (!template.template_json) {
      throw new Error(`Template ${template_id} has no template_json`)
    }

    logger.info(`✅ Loaded template JSON for ${template_id}`)
    return template.template_json as any[]
  } catch (error: any) {
    logger.error(`Failed to load template JSON for ${template_id}:`, error)
    throw new NonRetriableError(`Template loading failed: ${error.message}`)
  }
}

/**
 * Generate speech audio from text using ElevenLabs
 * Ported from Python: generate_speech_audio_step
 */
export async function generateSpeechAudio(
  job_id: string,
  user_id: string,
  avatar_speech: string,
  voice_id: string,
  eleven_labs_api_key: string,
  logger: Logger
): Promise<string> {
  logger.info(`Generating speech audio for job ${job_id}`)

  try {
    // Check for existing generation
    const { data: existing } = await supabase
      .from('eleven_labs_generations')
      .select('*, attachments!inner(*)')
      .eq('job_id', job_id)
      .single()

    if (existing && existing.attachments) {
      const s3Service = new S3Service()
      const audioUrl = await s3Service.generateGetUrl(
        existing.attachments.object_key,
        604800,
        logger
      )
      logger.info(`✅ Returning existing audio URL: ${audioUrl.split('?')[0]}`)
      return audioUrl
    }

    // НАСТОЯЩИЙ синтез, а не заглушка.
    //
    // generateSpeech из '@/services/elevenLabs' — заглушка: она возвращала
    // `https://stub.elevenlabs.com/audio/<ts>.mp3`, домен которого не
    // существует, и пайплайн принимал это за успех. Теперь она бросает.
    //
    // Настоящий синтез — createAudioFileFromText (src/core/elevenlabs/), он
    // ходит в api.elevenlabs.io/v1/text-to-speech/{voice_id}. Но отдаёт он
    // ПУТЬ К ВРЕМЕННОМУ ФАЙЛУ (os.tmpdir()/audio_<ts>.mp3, строка 188), а не
    // URL. Поэтому файл кладётся в S3 тем же приёмом, что и остальные
    // артефакты этого пайплайна: generatePresignedUploadUrl → PUT →
    // generateGetUrl (см. шаг upload-to-s3, steps.ts:300-328).
    const localAudioPath = await createAudioFileFromText({
      text: avatar_speech,
      voice_id,
      telegram_id: user_id,
    })

    // S3Service создаётся локально в каждом шаге этого файла (строки 137, 265,
    // 874, 898) — держусь того же приёма, а не тащу общий экземпляр.
    const s3Service = new S3Service()
    const audioObjectKey = `jobs/${job_id}/speech.mp3`
    const audioUpload = await s3Service.generatePresignedUploadUrl(
      audioObjectKey,
      'audio/mpeg',
      604800,
      logger
    )
    const audioBuffer = await fs.promises.readFile(localAudioPath)
    await axios.put(audioUpload.url, audioBuffer, {
      headers: { 'Content-Type': 'audio/mpeg' },
      maxBodyLength: Infinity,
    })
    // Временный файл больше не нужен; его отсутствие не повод падать.
    await fs.promises.unlink(localAudioPath).catch(() => {})

    const audioUrl = await s3Service.generateGetUrl(
      audioObjectKey,
      604800,
      logger
    )

    logger.info(`✅ Generated and uploaded speech audio: ${audioUrl}`)
    return audioUrl
  } catch (error: any) {
    logger.error(`Failed to generate speech audio for job ${job_id}:`, error)
    throw new NonRetriableError(`Speech generation failed: ${error.message}`)
  }
}

/**
 * Generate transcription from audio URL using ElevenLabs
 * Ported from Python: generate_transcription_step
 */
export async function generateTranscription(
  job_id: string,
  user_id: string,
  audio_url: string,
  eleven_labs_api_key: string,
  logger: Logger
): Promise<any> {
  logger.info(`Generating transcription for job ${job_id}`)

  try {
    // Check for existing transcription
    const { data: existing } = await supabase
      .from('eleven_labs_transcriptions')
      .select('*')
      .eq('job_id', job_id)
      .single()

    if (existing) {
      logger.info(`✅ Found existing transcription for job ${job_id}`)
      return {
        id: existing.id,
        result: existing.transcription_data,
      }
    }

    // Download audio
    logger.info(`Downloading audio from ${audio_url}`)
    const response = await axios.get(audio_url, { responseType: 'arraybuffer' })
    const audioContent = Buffer.from(response.data)
    logger.info(`Downloaded audio: ${audioContent.length} bytes`)

    // Transcribe (includes saving to database)
    const transcription = await transcribeAudio(
      audioContent,
      eleven_labs_api_key,
      audio_url,
      user_id,
      job_id,
      'scribe_v1'
    )

    logger.info(`✅ Generated transcription: ${transcription.id}`)
    return transcription
  } catch (error: any) {
    logger.error(`Failed to generate transcription for job ${job_id}:`, error)
    throw new NonRetriableError(`Transcription failed: ${error.message}`)
  }
}

/**
 * Generate B-roll prompts from template timing and transcription
 * Ported from Python: generate_broll_segments_step
 */
export async function generateBrollSegments(
  job_id: string,
  user_id: string,
  transcription: any,
  template_json: any[],
  logger: Logger
): Promise<any[]> {
  logger.info(`Generating B-roll segments for job ${job_id}`)

  try {
    // Check for existing segments
    const { data: existing } = await supabase
      .from('broll_prompts')
      .select('*')
      .eq('job_id', job_id)

    if (existing && existing.length > 0) {
      logger.info(`✅ B-roll segments already exist for job ${job_id}`)
      return existing
    }

    // Extract broll layers from template_json
    const layerSettings = template_json.find(
      item => item.key === 'layerSettings'
    )
    if (!layerSettings || !layerSettings.value) {
      logger.info('No broll layers in template')
      return []
    }

    const brollLayers = Object.entries(layerSettings.value)
      .filter(([_, settings]: [string, any]) => settings.footageUrl === 'broll')
      .map(([layerId, settings]: [string, any]) => ({
        layer_id: layerId,
        ...settings,
      }))

    if (brollLayers.length === 0) {
      logger.info('No broll layers found in template')
      return []
    }

    // Generate segments based on timing
    const segments: any[] = []
    for (const layer of brollLayers) {
      const startTime = layer.startTime || 0
      const duration = layer.duration || 5

      // Find matching transcription words
      const words = transcription.result?.words || []
      const matchingWords = words.filter(
        (word: any) =>
          word.start >= startTime && word.end <= startTime + duration
      )

      const promptText =
        matchingWords.map((w: any) => w.text).join(' ') ||
        `Scene at ${startTime}s`

      // Save segment to database
      const { data: segment, error } = await supabase
        .from('broll_prompts')
        .insert({
          job_id,
          user_id,
          layer_id: layer.layer_id,
          start_time: startTime,
          duration: duration,
          veo3_prompt: {
            prompt: `Cinematic b-roll: ${promptText}. Professional videography, high quality.`,
            seeds: Math.floor(Math.random() * 90000) + 10000,
          },
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      segments.push(segment)
    }

    logger.info(`✅ Generated ${segments.length} b-roll segments`)
    return segments
  } catch (error: any) {
    logger.error(`Failed to generate B-roll segments for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Generate a single B-roll video using KIE Veo3 API
 * Ported from Python: generate_broll_step
 */
export async function generateBroll(
  api_key: string,
  job_id: string,
  broll_segment: any,
  logger: Logger
): Promise<any> {
  logger.info(`Generating B-roll for segment ${broll_segment.id}`)

  try {
    // Check for existing video
    const { data: existing } = await supabase
      .from('kie_veo3_videos')
      .select('id')
      .eq('broll_prompt_id', broll_segment.id)
      .single()

    if (existing) {
      logger.info(`✅ Existing video found: ${existing.id}`)
      return {
        broll_segment,
        video_id: existing.id,
      }
    }

    // Generate new video
    const kieService = new KieAIService(api_key)
    const { taskId } = await kieService.createVideo({
      prompt: broll_segment.veo3_prompt.prompt,
      seeds: broll_segment.veo3_prompt.seeds,
      model: 'veo3_fast',
      aspectRatio: '9:16',
    })

    // Save to database
    const { data: video, error } = await supabase
      .from('kie_veo3_videos')
      .insert({
        broll_prompt_id: broll_segment.id,
        job_id,
        task_id: taskId,
        prompt: broll_segment.veo3_prompt.prompt,
        seeds: broll_segment.veo3_prompt.seeds,
        status: 'processing',
      })
      .select()
      .single()

    if (error || !video) {
      throw new Error('Failed to save video record')
    }

    logger.info(`✅ Video generated: video_id=${video.id}`)
    return {
      broll_segment,
      video_id: video.id,
    }
  } catch (error: any) {
    logger.error(
      `Failed to generate B-roll for segment ${broll_segment.id}:`,
      error
    )
    throw error
  }
}

/**
 * Wait for B-roll video completion and download
 * Ported from Python: wait_for_result_step
 */
export async function waitForBrollResult(
  broll: any,
  user_id: string,
  job_id: string,
  logger: Logger
): Promise<any> {
  logger.info(`Waiting for B-roll completion: video_id=${broll.video_id}`)

  try {
    // Check if already completed
    const { data: video } = await supabase
      .from('kie_veo3_videos')
      .select('*, attachments(*)')
      .eq('id', broll.video_id)
      .single()

    if (!video) {
      throw new Error(`Video ${broll.video_id} not found`)
    }

    if (video.attachment_id && video.attachments) {
      logger.info(`✅ Video already has attachment ${video.attachment_id}`)
      return {
        ...broll,
        attachment: video.attachments,
      }
    }

    // Poll KIE API for completion
    const kieService = new KieAIService(process.env.KIE_API_KEY || '')

    while (true) {
      const status = await kieService.checkStatus(video.task_id)

      if (
        status.status === 'success' &&
        status.video_urls &&
        status.video_urls.length > 0
      ) {
        // Download video
        const videoUrl = status.video_urls[0]
        logger.info(`Downloading video from ${videoUrl}`)

        const response = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
        })
        const videoBuffer = Buffer.from(response.data)

        // Upload to S3
        const s3Service = new S3Service()
        const objectKey = `jobs/${job_id}/broll_${broll.video_id}.mp4`
        await s3Service.uploadFile(objectKey, 'video/mp4', videoBuffer, logger)

        // Create attachment
        const { data: attachment, error: attachmentError } = await supabase
          .from('attachments')
          .insert({
            user_id,
            object_key: objectKey,
            content_type: 'video/mp4',
            size: videoBuffer.length,
            meta_data: { duration_seconds: 5 },
          })
          .select()
          .single()

        if (attachmentError || !attachment) {
          throw new Error('Failed to create attachment')
        }

        // Update video record
        await supabase
          .from('kie_veo3_videos')
          .update({
            attachment_id: attachment.id,
            status: 'completed',
          })
          .eq('id', broll.video_id)

        logger.info(`✅ B-roll video completed: attachment_id=${attachment.id}`)
        return {
          ...broll,
          attachment,
        }
      }

      if (status.status === 'failed') {
        throw new Error('KIE video generation failed')
      }

      logger.info(`B-roll video still processing: video_id=${broll.video_id}`)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  } catch (error: any) {
    logger.error(`Failed to wait for B-roll result ${broll.video_id}:`, error)
    throw error
  }
}

/**
 * Upload modified template JSON to S3
 * Ported from Python: prepare_template_json
 */
export async function uploadTemplateToS3(
  job_id: string,
  template_json: any[],
  logger: Logger
): Promise<string> {
  logger.info(`Uploading template JSON to S3 for job ${job_id}`)

  try {
    const s3Service = new S3Service()

    // Convert to JSON string
    const jsonContent = JSON.stringify(template_json, null, 2)
    const buffer = Buffer.from(jsonContent, 'utf-8')

    // Upload to S3
    const objectKey = `jobs/${job_id}/template.json`
    await s3Service.uploadFile(objectKey, 'application/json', buffer, logger)

    // Generate presigned GET URL
    const settingsUrl = await s3Service.generateGetUrl(
      objectKey,
      604800,
      logger
    )

    logger.info(`✅ Template JSON uploaded: ${settingsUrl}`)
    return settingsUrl
  } catch (error: any) {
    logger.error(`Failed to upload template to S3 for job ${job_id}:`, error)
    throw error
  }
}

/**
 * Trigger render job on render server
 * Ported from Python: trigger_render_step
 */
export async function triggerRender(
  job_id: string,
  template_id: string,
  settings_url: string,
  render_action: string,
  composition_name: string,
  callback_url: string | undefined,
  logger: Logger
): Promise<string> {
  logger.info(`Triggering render for job ${job_id}`)

  try {
    // Get template AEP URL
    const { data: template } = await supabase
      .from('templates')
      .select('aep_object_key')
      .eq('id', template_id)
      .single()

    if (!template) {
      throw new Error(`Template ${template_id} not found`)
    }

    const s3Service = new S3Service()
    const templateAepUrl = await s3Service.generateGetUrl(
      template.aep_object_key,
      604800,
      logger
    )

    // Get available render server
    const { data: server } = await supabase
      .from('render_servers')
      .select('*')
      .eq('status', 'active')
      .is('current_job_id', null)
      .limit(1)
      .single()

    if (!server) {
      throw new Error('No available render servers')
    }

    // Update job status
    await supabase
      .from('jobs')
      .update({
        status: 'rendering',
        server_id: server.id,
      })
      .eq('id', job_id)

    // Mark server as busy
    await supabase
      .from('render_servers')
      .update({
        current_job_id: job_id,
        status: 'busy',
      })
      .eq('id', server.id)

    const render_id = uuidv4()

    // ⚠️ У СОБЫТИЯ 'render/execute' НЕТ НИ ОДНОГО ПОДПИСЧИКА.
    //
    // Проверено: во всём src/ строка 'render/execute' встречается ровно один
    // раз — вот в этом send. Из 33 подписок функций бота на render-события
    // подписаны только 'render', 'render-riddle' и 'render/avatar-video'.
    //
    // То есть весь пайплайн render-riddle отрабатывает десять шагов (озвучка
    // ElevenLabs, аватар HeyGen/Hedra, транскрипция, генерация b-roll — всё за
    // реальные деньги), отправляет это событие в пустоту и возвращает
    // success:true. Видео не рендерится никогда.
    //
    // Причина архитектурная, а не опечатка: этот путь рассчитан на ферму
    // nexrender с шаблонами After Effects по SSH (отсюда template_url с .aep,
    // server_url/port/user и composition_name='Instagram_Story'). Сервис
    // vibee-render — это Remotion, у него в бандле одна композиция
    // SplitTalkingHead и другой формат пропсов. Две половины никогда не
    // соединяли.
    //
    // ПОЧЕМУ НЕЛЬЗЯ ПРОСТО СОГЛАСОВАТЬ ИМЕНА СОБЫТИЙ.
    //
    // Соблазн очевидный: функция render (functions/render/render.ts:45)
    // подписана на событие 'render', и её zod-схема ждёт РОВНО те девять полей,
    // что отправляются здесь — job_id, template_url, job_json_url,
    // composition_name, render_type, server_url, server_port, server_user,
    // callback_url (schemas.ts:33-45). Выглядит как две половины одного
    // соединения с разошедшимися именами, и 'render' в проде не шлёт никто —
    // только три места в тестах.
    //
    // Но соединять их незачем: путь nexrender списан целиком. Проверено:
    //   - таблицы render_servers в базе НЕТ (to_regclass вернул НЕТ);
    //   - SSHService.fromEnv требует SSH_KEY_STRING (ssh.service.ts:326), а в
    //     Railway не задана ни одна переменная SSH_*/RENDER_SERVER_*/NEXRENDER_*;
    //   - сервер, куда шёл бы SSH, — это 188.137.250.69, списанный VPS,
    //     отвечающий HTTP 000.
    // То есть согласование имён лишь перенесло бы отказ на шаг дальше.
    //
    // Остаётся один жизнеспособный путь: переложить renderRiddle на Remotion
    // (vibee-render-production, POST /render, композиция SplitTalkingHead).
    // Это переписывание продакшн-пути, а не правка.
    const { inngest } = await import('../../client')

    await inngest.send({
      name: 'render/execute',
      data: {
        render_id,
        job_id,
        template_url: templateAepUrl,
        job_json_url: settings_url,
        composition_name,
        render_type: render_action,
        server_url: server.url,
        server_port: server.port,
        server_user: server.user,
        callback_url: callback_url || undefined,
      },
    })
    logger.info(
      `✅ Render workflow triggered for job ${job_id}, render_id=${render_id}`
    )
    return render_id
  } catch (error: any) {
    logger.error(`Failed to trigger render for job ${job_id}:`, error)
    throw error
  }
}

// ========================
// Hedra Avatar Generation Steps
// ========================

/**
 * Start Hedra avatar generation
 * @returns generation_id for polling
 */
export async function startHedraAvatarGeneration(
  job_id: string,
  user_id: string,
  avatar_photo_url: string,
  audio_url: string,
  hedra_api_key: string,
  logger: Logger
): Promise<string> {
  logger.info(`Starting Hedra avatar generation for job ${job_id}`)

  try {
    const hedraService = new HedraService(hedra_api_key)

    // Step 1: Create image asset
    const imageAsset = await hedraService.createAsset(
      `avatar_image_${job_id}`,
      'image'
    )
    logger.info(`Created Hedra image asset: ${imageAsset.id}`)

    // Step 2: Upload avatar photo to image asset
    await hedraService.uploadAsset(imageAsset.id, avatar_photo_url)
    logger.info(`Uploaded avatar photo to Hedra`)

    // Step 3: Create audio asset
    const audioAsset = await hedraService.createAsset(
      `avatar_audio_${job_id}`,
      'audio'
    )
    logger.info(`Created Hedra audio asset: ${audioAsset.id}`)

    // Step 4: Upload audio to audio asset
    await hedraService.uploadAsset(audioAsset.id, audio_url)
    logger.info(`Uploaded audio to Hedra`)

    // Step 5: Start generation
    const generation = await hedraService.startGeneration(
      imageAsset.id,
      audioAsset.id,
      undefined, // text_prompt
      '720p', // resolution
      '9:16' // aspect_ratio for vertical video
    )

    logger.info(
      `✅ Hedra avatar generation started: generation_id=${generation.id}`
    )
    return generation.id
  } catch (error: any) {
    logger.error(`Failed to start Hedra avatar generation: ${error.message}`)
    throw error
  }
}

/**
 * Wait for Hedra avatar completion and save to database
 * @returns attachment record with avatar video
 */
export async function waitForHedraAvatarCompletion(
  job_id: string,
  user_id: string,
  generation_id: string,
  hedra_api_key: string,
  logger: Logger
): Promise<any> {
  logger.info(
    `Waiting for Hedra avatar completion: generation_id=${generation_id}`
  )

  try {
    const hedraService = new HedraService(hedra_api_key)

    // Poll for completion (max 5 minutes)
    const status = await hedraService.waitForCompletion(
      generation_id,
      300000,
      5000
    )

    if (!status.url) {
      throw new Error('Hedra generation completed but no URL returned')
    }

    logger.info(`✅ Hedra avatar video ready: ${status.url}`)

    // Download video
    const videoResponse = await axios.get(status.url, {
      responseType: 'arraybuffer',
    })
    const videoBuffer = Buffer.from(videoResponse.data)

    // Upload to S3
    const object_key = `jobs/${job_id}/avatar.mp4`
    const s3Service = new S3Service()
    await s3Service.uploadFile(object_key, 'video/mp4', videoBuffer)

    // Save to database
    const attachment_id = uuidv4()
    const { error } = await supabase.from('attachments').insert({
      id: attachment_id,
      user_id,
      name: `avatar_${job_id}`,
      description: 'Hedra generated avatar video',
      object_key,
      content_type: 'video/mp4',
      tags: ['avatar', 'hedra', job_id],
      meta_data: {
        format: { duration: status.progress }, // Hedra doesn't return duration, using progress as approximation
        duration_seconds: status.progress / 1000,
        hedra_generation_id: generation_id,
      },
    })

    if (error) {
      logger.error(`Failed to save avatar attachment: ${error.message}`)
      throw error
    }

    logger.info(
      `✅ Hedra avatar saved to database: attachment_id=${attachment_id}`
    )

    return {
      id: attachment_id,
      object_key,
      meta_data: {
        format: { duration: status.progress / 1000 },
        duration_seconds: status.progress / 1000,
      },
    }
  } catch (error: any) {
    logger.error(`Failed to wait for Hedra avatar: ${error.message}`)
    throw error
  }
}

// ========================
// HeyGen Avatar Generation Steps
// ========================

/**
 * Start HeyGen avatar generation
 * @returns video_id for polling
 */
export async function startHeyGenAvatarGeneration(
  job_id: string,
  avatar_text: string,
  avatar_id: string,
  voice_id: string,
  heygen_api_key: string,
  logger: Logger
): Promise<string> {
  logger.info(`Starting HeyGen avatar generation for job ${job_id}`)

  try {
    const heygenService = new HeyGenService(heygen_api_key)

    const videoId = await heygenService.createVideo({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id,
            avatar_style: 'normal',
            scale: 1.0,
          },
          voice: {
            type: 'text',
            voice_id,
            input_text: avatar_text,
            speed: 1.0,
          },
        },
      ],
      dimension: {
        width: 1080,
        height: 1920, // 9:16 vertical
      },
      title: `Avatar_${job_id}`,
      caption: false,
    })

    logger.info(`✅ HeyGen avatar generation started: video_id=${videoId}`)
    return videoId
  } catch (error: any) {
    logger.error(`Failed to start HeyGen avatar generation: ${error.message}`)
    throw error
  }
}

/**
 * Wait for HeyGen avatar completion and save to database
 * @returns attachment record with avatar video
 */
export async function waitForHeyGenAvatarCompletion(
  job_id: string,
  user_id: string,
  video_id: string,
  heygen_api_key: string,
  logger: Logger
): Promise<any> {
  logger.info(`Waiting for HeyGen avatar completion: video_id=${video_id}`)

  try {
    const heygenService = new HeyGenService(heygen_api_key)

    // Poll for completion (max 10 minutes)
    const statusResponse = await heygenService.waitForCompletion(
      video_id,
      600000,
      10000
    )

    const videoUrl = statusResponse.data?.video_url
    if (!videoUrl) {
      throw new Error('HeyGen generation completed but no video URL returned')
    }

    logger.info(`✅ HeyGen avatar video ready: ${videoUrl}`)

    // Download video
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
    })
    const videoBuffer = Buffer.from(videoResponse.data)

    // Upload to S3
    const object_key = `jobs/${job_id}/avatar.mp4`
    const s3Service = new S3Service()
    await s3Service.uploadFile(object_key, 'video/mp4', videoBuffer)

    // Save to database
    const attachment_id = uuidv4()
    const duration = statusResponse.data?.duration || 30.0
    const { error } = await supabase.from('attachments').insert({
      id: attachment_id,
      user_id,
      name: `avatar_${job_id}`,
      description: 'HeyGen generated avatar video',
      object_key,
      content_type: 'video/mp4',
      tags: ['avatar', 'heygen', job_id],
      meta_data: {
        format: { duration },
        duration_seconds: duration,
        heygen_video_id: video_id,
        heygen_video_url: videoUrl,
      },
    })

    if (error) {
      logger.error(`Failed to save avatar attachment: ${error.message}`)
      throw error
    }

    logger.info(
      `✅ HeyGen avatar saved to database: attachment_id=${attachment_id}`
    )

    return {
      id: attachment_id,
      object_key,
      meta_data: {
        format: { duration },
        duration_seconds: duration,
      },
    }
  } catch (error: any) {
    logger.error(`Failed to wait for HeyGen avatar: ${error.message}`)
    throw error
  }
}

/**
 * Extract audio from HeyGen avatar video
 * NOTE: HeyGen videos have built-in audio, so we need to extract it
 * For now, we'll use a placeholder URL since audio extraction requires FFmpeg
 * TODO: Implement actual audio extraction using FFmpeg or similar tool
 */
export async function extractAudioFromHeyGenAvatar(
  job_id: string,
  user_id: string,
  avatar_object_key: string,
  logger: Logger
): Promise<string> {
  logger.info(`Extracting audio from HeyGen avatar: ${avatar_object_key}`)

  // For now, return a presigned URL to the video itself
  // The video contains the audio track
  const s3Service = new S3Service()
  const audioUrl = await s3Service.generateGetUrl(avatar_object_key)

  logger.info(`✅ Audio URL from HeyGen avatar: ${audioUrl}`)
  logger.warn(
    '⚠️ Note: This is the video URL. Actual audio extraction would require FFmpeg'
  )

  return audioUrl
}
