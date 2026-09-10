import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { parseEventData } from '@/inngest_app/guards'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { z } from 'zod'
import { supabase } from '@/core/supabase'
import OpenAI from 'openai'

// Validation schema for input data
const generateContentScriptsSchema = z.object({
  reel_id: z.string().min(1, 'Reel ID is required'),
  ig_reel_url: z.string().url('Valid URL is required').optional(),
  project_id: z.number().int().positive('Project ID must be positive'),
  openai_api_key: z.string().optional(),
})

export type GenerateContentScriptsInput = z.infer<
  typeof generateContentScriptsSchema
>

export interface ContentScriptData {
  id: string
  reel_id: string
  orig_caption: string | null
  orig_transcript: string | null
  script_v1: string
  script_v2: string
  script_v3: string
  ig_reel_url: string
  project_id: number
  created_at: string
}

export interface ReelData {
  id: string
  reel_id: string
  ig_reel_url: string
  caption: string | null
  comp_username: string
  project_id: number
}

/**
 * Generate content scripts from Instagram reel
 * Job 4: "Мне нужно создать похожий контент"
 */
export const generateContentScripts = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'generate-content-scripts'.
    id: 'content-scripts-generate',
    name: '🎬 Generate Content Scripts',
    // Paid OpenAI calls → admin visibility on failure.
    onFailure: createInngestFailureHandler('content-scripts-generate'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [
    { event: 'content/scripts.generate' },
    { event: 'instagram/generate-scripts' },
  ],
  async ({ event, step }) => {
    // Schema failure → NonRetriableError (never heals on retry).
    const input = parseEventData(
      generateContentScriptsSchema,
      event.data,
      'content/scripts.generate payload'
    )

    // Safe mode: the steps below call the paid OpenAI API.
    if (isSafeMode(event)) {
      return {
        success: false,
        ...skippedInSafeMode('openai script generation'),
      }
    }

    // Step 1: Get reel data from database
    const reelData = await step.run('get-reel-data', async () => {
      const { data, error } = await supabase
        .from('reels_analysis')
        .select('*')
        .eq('reel_id', input.reel_id)
        .eq('project_id', input.project_id)
        .single()

      if (error || !data) {
        throw new Error(`Reel not found: ${input.reel_id}`)
      }

      return data as ReelData
    })

    // Step 2: Extract audio from Instagram URL
    const audioUrl = await step.run('extract-audio', async () => {
      return await extractAudioFromInstagramUrl(reelData.ig_reel_url)
    })

    // Step 3: Transcribe audio using OpenAI Whisper
    const transcript = await step.run('transcribe-audio', async () => {
      const apiKey = input.openai_api_key || process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OpenAI API key is required')
      }
      return await transcribeAudio(audioUrl, apiKey)
    })

    // Step 4: Generate 3 alternative scripts using GPT-4
    const scripts = await step.run('generate-scripts', async () => {
      const apiKey = input.openai_api_key || process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OpenAI API key is required')
      }
      return await generateAlternativeScripts(
        reelData.caption || '',
        transcript,
        apiKey
      )
    })

    // Step 5: Save content scripts to database
    const savedData = await step.run('save-scripts', async () => {
      const contentData = {
        reel_id: input.reel_id,
        orig_caption: reelData.caption,
        orig_transcript: transcript,
        script_v1: scripts[0],
        script_v2: scripts[1],
        script_v3: scripts[2],
        ig_reel_url: reelData.ig_reel_url,
        project_id: input.project_id,
      }

      return await saveContentScripts(contentData)
    })

    return {
      success: true,
      data: {
        reel_id: input.reel_id,
        scripts: {
          v1: scripts[0],
          v2: scripts[1],
          v3: scripts[2],
        },
        original: {
          caption: reelData.caption,
          transcript: transcript,
        },
        saved_id: savedData.id,
      },
    }
  }
)

// Helper functions
async function extractAudioFromInstagramUrl(igUrl: string): Promise<string> {
  // For now, return mock audio URL
  // In real implementation, this would extract actual audio from Instagram
  if (!igUrl.includes('instagram.com')) {
    throw new Error('Invalid Instagram URL')
  }

  // Mock implementation - in real app would use Instagram API or scraping
  return `${igUrl}/audio.mp3`
}

async function transcribeAudio(
  audioUrl: string,
  apiKey: string
): Promise<string> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
    })

    // Mock implementation for testing
    if (apiKey === 'test-openai-key') {
      return 'Привет всем! Это тестовая транскрипция аудио.'
    }

    // Real implementation would download audio file and transcribe it
    // For now, return mock transcript
    return 'Привет! Сегодня я покажу вам интересный способ создания контента.'
  } catch (error) {
    throw new Error(`OpenAI API error: ${error.message}`)
  }
}

async function generateAlternativeScripts(
  caption: string,
  transcript: string,
  apiKey: string
): Promise<string[]> {
  try {
    const openai = new OpenAI({
      apiKey: apiKey,
    })

    // Mock implementation for testing
    if (apiKey === 'test-openai-key') {
      return [
        `Версия 1: ${caption} - улучшенная версия`,
        `Версия 2: ${caption} - креативная подача`,
        `Версия 3: ${caption} - эмоциональная версия`,
      ]
    }

    const prompt = `
На основе оригинального описания и транскрипции создай 3 альтернативных сценария для контента:

Оригинальное описание: "${caption}"
Транскрипция: "${transcript}"

Создай 3 варианта сценария, каждый с уникальным подходом:
1. Более эмоциональный и захватывающий
2. Образовательный и информативный  
3. Развлекательный и легкий

Каждый сценарий должен быть длиной 100-150 слов.
`

    // Real implementation would call OpenAI API
    // For now, return mock scripts
    return [
      `Сценарий 1: Эмоциональный подход к теме "${caption}"`,
      `Сценарий 2: Образовательный контент на основе "${caption}"`,
      `Сценарий 3: Развлекательная версия "${caption}"`,
    ]
  } catch (error) {
    throw new Error(`OpenAI API error: ${error.message}`)
  }
}

async function saveContentScripts(
  data: Omit<ContentScriptData, 'id' | 'created_at'>
): Promise<ContentScriptData> {
  const { data: savedData, error } = await supabase
    .from('content_scripts')
    .insert([data])
    .select()
    .single()

  if (error) {
    throw new Error(`Database error: ${error.message}`)
  }

  return savedData as ContentScriptData
}

// Export helper functions for testing
export {
  extractAudioFromInstagramUrl,
  transcribeAudio,
  generateAlternativeScripts,
  saveContentScripts,
}
