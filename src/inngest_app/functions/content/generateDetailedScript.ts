/**
 * Generate detailed script for scenario clips with camera positions and detailed prompts
 * Генерация детального скрипта раскадровки с положением камеры и детальными промптами
 */

import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { parseEventData } from '@/inngest_app/guards'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import OpenAI from 'openai'
import { supabase } from '@/core/supabase'
import { z } from 'zod'

// Схема валидации входных данных
const generateDetailedScriptSchema = z.object({
  photo_url: z.string().url('Некорректный URL фотографии'),
  base_prompt: z
    .string()
    .min(10, 'Промпт должен содержать минимум 10 символов'),
  scene_count: z.number().min(1).max(20, 'Максимум 20 сцен'),
  project_id: z.number(),
  requester_telegram_id: z.string(),
  theme: z
    .enum(['CREATION', 'EPIC_STORY', 'PRODUCT_SHOWCASE', 'CUSTOM'])
    .optional()
    .default('CUSTOM'),
  style: z
    .enum(['CINEMATIC', 'DOCUMENTARY', 'ARTISTIC', 'COMMERCIAL'])
    .optional()
    .default('CINEMATIC'),
})

type GenerateDetailedScriptInput = z.infer<typeof generateDetailedScriptSchema>

// Детальная структура сцены с техническими параметрами
interface DetailedScene {
  scene_number: number
  title: string
  description: string
  detailed_prompt: string
  camera_position: {
    angle:
      | 'wide_shot'
      | 'medium_shot'
      | 'close_up'
      | 'extreme_close_up'
      | 'birds_eye'
      | 'low_angle'
      | 'high_angle'
    movement:
      | 'static'
      | 'pan_left'
      | 'pan_right'
      | 'tilt_up'
      | 'tilt_down'
      | 'zoom_in'
      | 'zoom_out'
      | 'dolly_in'
      | 'dolly_out'
    focus: 'deep_focus' | 'shallow_focus' | 'rack_focus' | 'soft_focus'
  }
  lighting: {
    type:
      | 'natural'
      | 'golden_hour'
      | 'blue_hour'
      | 'studio'
      | 'dramatic'
      | 'soft'
      | 'hard'
    direction: 'front' | 'back' | 'side' | 'top' | 'bottom' | 'rim'
    mood: 'bright' | 'dark' | 'moody' | 'ethereal' | 'warm' | 'cool'
  }
  composition: {
    rule:
      | 'rule_of_thirds'
      | 'center_composition'
      | 'leading_lines'
      | 'symmetry'
      | 'golden_ratio'
    foreground: string
    midground: string
    background: string
  }
  color_palette: {
    primary: string
    secondary: string
    accent: string
    mood: 'vibrant' | 'muted' | 'monochrome' | 'high_contrast' | 'desaturated'
  }
  technical_details: {
    render_quality: 'high' | 'ultra' | 'maximum'
    style_strength: number // 0.1-1.0
    negative_prompts: string[]
  }
  duration_seconds: number // для будущего видео
  transition_to_next: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'zoom_transition'
}

// Библейские темы с детальными сценами
const DETAILED_BIBLE_THEMES = {
  CREATION: {
    title: 'Сотворение мира',
    scenes: [
      {
        title: 'Divine Light',
        base_description: 'В начале сотворил Бог свет и отделил его от тьмы',
        camera_suggestion: {
          angle: 'wide_shot',
          movement: 'static',
          focus: 'deep_focus',
        },
        lighting_suggestion: {
          type: 'dramatic',
          direction: 'top',
          mood: 'ethereal',
        },
        color_palette: {
          primary: 'golden',
          secondary: 'deep_blue',
          accent: 'white',
          mood: 'high_contrast',
        },
      },
      {
        title: 'Waters Divided',
        base_description:
          'Разделение вод небесных и земных, создание твердого свода',
        camera_suggestion: {
          angle: 'medium_shot',
          movement: 'tilt_up',
          focus: 'deep_focus',
        },
        lighting_suggestion: {
          type: 'natural',
          direction: 'side',
          mood: 'cool',
        },
        color_palette: {
          primary: 'blue',
          secondary: 'white',
          accent: 'silver',
          mood: 'muted',
        },
      },
      {
        title: 'Earth and Seas',
        base_description:
          'Собрание вод в одно место и появление суши с растениями',
        camera_suggestion: {
          angle: 'birds_eye',
          movement: 'zoom_out',
          focus: 'deep_focus',
        },
        lighting_suggestion: {
          type: 'golden_hour',
          direction: 'side',
          mood: 'warm',
        },
        color_palette: {
          primary: 'green',
          secondary: 'brown',
          accent: 'gold',
          mood: 'vibrant',
        },
      },
      {
        title: 'Celestial Bodies',
        base_description: 'Сотворение солнца, луны и звезд для освещения земли',
        camera_suggestion: {
          angle: 'low_angle',
          movement: 'pan_right',
          focus: 'shallow_focus',
        },
        lighting_suggestion: {
          type: 'dramatic',
          direction: 'back',
          mood: 'bright',
        },
        color_palette: {
          primary: 'gold',
          secondary: 'purple',
          accent: 'white',
          mood: 'vibrant',
        },
      },
    ],
  },
}

/**
 * Генерация детального скрипта раскадровки
 */
export const generateDetailedScript = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'generate-detailed-script'.
    id: 'content-detailed-script-generate',
    name: '📝 Generate Detailed Script',
    concurrency: [{ limit: 3 }],
    // Paid OpenAI calls → admin visibility on failure.
    onFailure: createInngestFailureHandler('content-detailed-script-generate'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [
    { event: 'content/detailed-script.generate' },
    { event: 'content/generate-detailed-script' },
  ],
  async ({ event, step, logger: log }) => {
    // Schema failure → NonRetriableError (never heals on retry).
    const input = parseEventData(
      generateDetailedScriptSchema,
      event.data,
      'content/detailed-script.generate payload'
    )

    // Safe mode: the steps below call the paid OpenAI API.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('openai detailed script')
      log.warn('🛡️ [DETAILED SCRIPT] safe mode — generation skipped', skipped)
      return { success: false, ...skipped }
    }
    const runId = event.id

    log.info('📝 Начинаем генерацию детального скрипта', { input, runId })

    // Step 1: Создаем запись в базе данных
    const scriptRecord = await step.run('create-script-record', async () => {
      log.info('💾 Создаем запись скрипта в базе данных')

      const recordData = {
        project_id: input.project_id,
        requester_telegram_id: input.requester_telegram_id,
        base_photo_url: input.photo_url,
        base_prompt: input.base_prompt,
        scene_count: input.scene_count,
        theme: input.theme,
        style: input.style,
        status: 'PROCESSING',
        created_at: new Date(),
      }

      const { data, error } = await supabase
        .from('detailed_scripts')
        .insert(recordData)
        .select()
        .single()

      if (error) {
        throw new Error(`Ошибка создания записи скрипта: ${error.message}`)
      }

      return data
    })

    // Step 2: Генерируем детальные сцены
    const detailedScenes = await step.run(
      'generate-detailed-scenes',
      async () => {
        log.info('🎭 Генерируем детальные сцены')

        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        })

        let scenes: DetailedScene[] = []

        // Если указана библейская тема, используем предустановленные сцены
        if (input.theme === 'CREATION' && DETAILED_BIBLE_THEMES.CREATION) {
          const creationScenes = DETAILED_BIBLE_THEMES.CREATION.scenes.slice(
            0,
            input.scene_count
          )

          scenes = creationScenes.map((scene, index) => ({
            scene_number: index + 1,
            title: scene.title,
            description: scene.base_description,
            detailed_prompt: generateDetailedPrompt(
              scene,
              input.base_prompt,
              input.style
            ),
            camera_position: {
              angle: scene.camera_suggestion.angle,
              movement: scene.camera_suggestion.movement,
              focus: scene.camera_suggestion.focus,
            },
            lighting: {
              type: scene.lighting_suggestion.type,
              direction: scene.lighting_suggestion.direction,
              mood: scene.lighting_suggestion.mood,
            },
            composition: {
              rule: 'rule_of_thirds',
              foreground: 'mystical energy particles',
              midground: 'main subject matter',
              background: 'cosmic divine atmosphere',
            },
            color_palette: {
              primary: scene.color_palette.primary,
              secondary: scene.color_palette.secondary,
              accent: scene.color_palette.accent,
              mood: scene.color_palette.mood,
            },
            technical_details: {
              render_quality: 'ultra',
              style_strength: 0.8,
              negative_prompts: [
                'blurry',
                'low quality',
                'distorted',
                'artifacts',
              ],
            },
            duration_seconds: 3,
            transition_to_next:
              index === creationScenes.length - 1 ? 'fade' : 'dissolve',
          })) as DetailedScene[]

          log.info('📜 Используем библейскую тему CREATION', {
            scenes: scenes.length,
          })
        } else {
          // Генерируем кастомные сцены с помощью OpenAI
          const systemPrompt = `
Ты - эксперт по созданию детальных киносценариев и раскадровки.
Создай ${
            input.scene_count
          } детальных сцен для ${input.style.toLowerCase()} стиля съемки.

Каждая сцена должна содержать:
1. Название сцены
2. Детальное описание
3. Положение и движение камеры
4. Настройки освещения
5. Композиционные элементы
6. Цветовую палитру

Базовый промпт: "${input.base_prompt}"
Стиль: ${input.style}

Верни результат в формате JSON с детальной структурой каждой сцены.
`

          const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Создай ${input.scene_count} детальных сцен`,
              },
            ],
            temperature: 0.7,
          })

          try {
            const aiScenes = JSON.parse(
              response.choices[0]?.message?.content || '[]'
            )
            scenes = aiScenes.map((scene: any, index: number) => ({
              scene_number: index + 1,
              title: scene.title || `Сцена ${index + 1}`,
              description: scene.description || `Описание сцены ${index + 1}`,
              detailed_prompt:
                scene.detailed_prompt ||
                `${input.base_prompt}, scene ${index + 1}`,
              camera_position: scene.camera_position || {
                angle: 'medium_shot',
                movement: 'static',
                focus: 'deep_focus',
              },
              lighting: scene.lighting || {
                type: 'natural',
                direction: 'front',
                mood: 'bright',
              },
              composition: scene.composition || {
                rule: 'rule_of_thirds',
                foreground: 'main subject',
                midground: 'supporting elements',
                background: 'environmental context',
              },
              color_palette: scene.color_palette || {
                primary: 'natural',
                secondary: 'complementary',
                accent: 'highlight',
                mood: 'balanced',
              },
              technical_details: {
                render_quality: 'high',
                style_strength: 0.7,
                negative_prompts: ['blurry', 'low quality', 'distorted'],
              },
              duration_seconds: 3,
              transition_to_next:
                index === input.scene_count - 1 ? 'fade' : 'cut',
            }))
          } catch (error) {
            log.error('Ошибка парсинга AI ответа, используем fallback', error)
            // Fallback: создаем базовые сцены
            scenes = Array.from({ length: input.scene_count }, (_, i) => ({
              scene_number: i + 1,
              title: `Сцена ${i + 1}`,
              description: `${input.base_prompt} - сцена ${i + 1}`,
              detailed_prompt: `${input.base_prompt}, scene ${
                i + 1
              }, ${input.style.toLowerCase()} style`,
              camera_position: {
                angle: 'medium_shot',
                movement: 'static',
                focus: 'deep_focus',
              },
              lighting: { type: 'natural', direction: 'front', mood: 'bright' },
              composition: {
                rule: 'rule_of_thirds',
                foreground: 'main subject',
                midground: 'supporting elements',
                background: 'environmental context',
              },
              color_palette: {
                primary: 'natural',
                secondary: 'complementary',
                accent: 'highlight',
                mood: 'balanced',
              },
              technical_details: {
                render_quality: 'high',
                style_strength: 0.7,
                negative_prompts: ['blurry', 'low quality'],
              },
              duration_seconds: 3,
              transition_to_next: 'cut',
            })) as unknown as DetailedScene[]
          }
        }

        return scenes
      }
    )

    // Step 3: Сохраняем детальный скрипт
    const savedScript = await step.run('save-detailed-script', async () => {
      log.info('💾 Сохраняем детальный скрипт')

      const { data, error } = await supabase
        .from('detailed_scripts')
        .update({
          detailed_scenes: detailedScenes,
          status: 'COMPLETED',
          completed_at: new Date(),
        })
        .eq('id', scriptRecord.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Ошибка сохранения скрипта: ${error.message}`)
      }

      return data
    })

    log.info('✅ Детальный скрипт успешно сгенерирован', {
      scriptId: savedScript.id,
      sceneCount: detailedScenes.length,
    })

    return {
      success: true,
      script_id: savedScript.id,
      scene_count: detailedScenes.length,
      scenes: detailedScenes,
    }
  }
)

// Вспомогательная функция для генерации детального промпта
function generateDetailedPrompt(
  scene: any,
  basePrompt: string,
  style: string
): string {
  const cameraAnglePrompts = {
    wide_shot: 'wide establishing shot, full scene visibility',
    medium_shot: 'medium shot, balanced composition',
    close_up: 'close-up shot, intimate detail focus',
    extreme_close_up: 'extreme close-up, dramatic detail',
    birds_eye: 'aerial birds eye view, top down perspective',
    low_angle: 'low angle shot, powerful upward perspective',
    high_angle: 'high angle shot, looking down perspective',
  }

  const lightingPrompts = {
    natural: 'natural lighting',
    golden_hour: 'golden hour warm lighting',
    blue_hour: 'blue hour cool lighting',
    studio: 'professional studio lighting',
    dramatic: 'dramatic cinematic lighting',
    soft: 'soft diffused lighting',
    hard: 'hard directional lighting',
  }

  return `${basePrompt}, ${scene.base_description}, ${
    cameraAnglePrompts[scene.camera_suggestion.angle]
  }, ${
    lightingPrompts[scene.lighting_suggestion.type]
  }, ${style.toLowerCase()} style, professional quality, highly detailed, 8k resolution`
}
