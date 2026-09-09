/**
 * Generate text-based scenario scripts for bloggers
 * 🎬 Генерация текстовых сценариев для блогеров и цифровых творцов
 */

import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { parseEventData } from '@/inngest_app/guards'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import OpenAI from 'openai'
import { supabase } from '@/core/supabase'
import * as fs from 'fs'
import * as path from 'path'
import archiver from 'archiver'
import * as XLSX from 'xlsx'
import {
  type ScenarioClipsRecord,
  type SceneData,
  type SceneVariant,
  type ScenarioReportMetadata,
  generateScenarioClipsSchema,
} from '@/interfaces/scenario-clips.interface'

// 🎬 БЛОГЕРСКИЕ СТИЛИ И ТЕМЫ ДЛЯ СОВРЕМЕННОГО КОНТЕНТА
const BLOGGER_STYLES = {
  // 📱 TikTok стиль - быстро, ярко, захватывающе
  TIKTOK: {
    name: 'TikTok Creator',
    description: 'Быстрый, динамичный контент для коротких видео',
    scenes: [
      'Hook moment - яркое начало, которое зацепит зрителя в первые 3 секунды',
      'Story setup - быстрая подача основной идеи или проблемы',
      'Conflict moment - момент напряжения или неожиданный поворот',
      'Resolution - быстрое решение или кульминация',
      'Call to action - призыв к действию, подписке или лайку',
      'Bonus content - дополнительная ценность или секрет',
      'Viral moment - момент, который захочется пересматривать',
      'Community hook - что-то для комментариев и обсуждений',
    ],
    visual_style:
      'dynamic vertical composition, bright colors, high contrast, mobile-first design, trendy aesthetics',
    mood: 'energetic, playful, attention-grabbing',
    tips: [
      'Первые 3 секунды - самые важные',
      'Используй популярные звуки и музыку',
      'Добавь субтитры для лучшего восприятия',
      'Создай момент для паузы и комментирования',
    ],
  },

  // 📺 YouTube стиль - образовательный, глубокий
  YOUTUBE: {
    name: 'YouTube Creator',
    description: 'Образовательный, развлекательный контент для длинных видео',
    scenes: [
      'Strong intro - мощное вступление с обещанием ценности',
      'Problem identification - четкое определение проблемы зрителя',
      'Context building - создание контекста и background истории',
      'Main content delivery - основная ценная информация',
      'Example demonstration - практические примеры или кейсы',
      'Expert insights - экспертные мнения или глубокие знания',
      'Action steps - конкретные шаги для зрителя',
      'Conclusion & CTA - итоги и призыв к действию',
    ],
    visual_style:
      'cinematic 16:9 composition, professional lighting, clear backgrounds, educational graphics',
    mood: 'authoritative, educational, engaging',
    tips: [
      'Создай интригу в первые 15 секунд',
      'Используй визуальные примеры и графики',
      'Структурируй контент с четкими разделами',
      'Добавь моменты для взаимодействия с аудиторией',
    ],
  },

  // 📸 Instagram стиль - эстетичный, lifestyle
  INSTAGRAM: {
    name: 'Instagram Creator',
    description: 'Эстетичный, lifestyle контент для Stories и Reels',
    scenes: [
      'Aesthetic opener - красивое визуальное начало',
      'Lifestyle moment - момент из повседневной жизни',
      'Behind the scenes - закулисье или процесс создания',
      'Personal story - личная история или опыт',
      'Value sharing - полезная информация или совет',
      'Community moment - взаимодействие с подписчиками',
      'Inspiration shot - вдохновляющий момент или цитата',
      'Next content teaser - анонс следующего контента',
    ],
    visual_style:
      'aesthetic square or vertical composition, soft natural lighting, minimalist design, Instagram-worthy',
    mood: 'aspirational, authentic, lifestyle-focused',
    tips: [
      'Поддерживай единый эстетический стиль',
      'Используй естественное освещение',
      'Создавай контент для Stories и постов',
      'Добавляй интерактивные элементы',
    ],
  },

  // 💼 Business/LinkedIn стиль - профессиональный
  BUSINESS: {
    name: 'Business Creator',
    description: 'Профессиональный контент для бизнес-аудитории',
    scenes: [
      'Industry insight - экспертный взгляд на индустрию',
      'Case study intro - представление кейса или примера',
      'Problem analysis - анализ бизнес-проблемы',
      'Solution presentation - представление решения',
      'Results showcase - демонстрация результатов',
      'Lessons learned - выводы и уроки',
      'Professional advice - профессиональные советы',
      'Network building - призыв к профессиональному общению',
    ],
    visual_style:
      'professional clean composition, corporate colors, modern minimalist design, business-appropriate',
    mood: 'professional, authoritative, trustworthy',
    tips: [
      'Фокусируйся на ценности для бизнеса',
      'Используй данные и факты',
      'Поддерживай профессиональный тон',
      'Создавай контент для принятия решений',
    ],
  },

  // 🍳 Lifestyle/Tutorial стиль - пошаговый, практичный
  LIFESTYLE: {
    name: 'Lifestyle Creator',
    description: 'Практичный контент о жизни, хобби, DIY',
    scenes: [
      'Daily moment - момент из повседневной жизни',
      'Problem introduction - представление бытовой проблемы',
      'Materials overview - обзор необходимых материалов',
      'Step-by-step process - пошаговый процесс выполнения',
      'Tips and tricks - полезные советы и лайфхаки',
      'Final result - демонстрация финального результата',
      'Personal reflection - личные размышления об опыте',
      'Audience engagement - вопросы к аудитории',
    ],
    visual_style:
      'cozy home environment, natural lighting, step-by-step visuals, lifestyle photography',
    mood: 'helpful, authentic, approachable',
    tips: [
      'Показывай процесс пошагово',
      'Делись личным опытом',
      'Создавай уютную атмосферу',
      'Давай практические советы',
    ],
  },

  // 🎮 Gaming/Tech стиль - для геймеров и техно-блогеров
  GAMING: {
    name: 'Gaming/Tech Creator',
    description: 'Контент для геймеров и технических блогеров',
    scenes: [
      'Epic intro - эпичное начало с игровой музыкой',
      'Setup showcase - демонстрация игрового сетапа',
      'Gameplay highlight - лучшие моменты из игры',
      'Tech explanation - объяснение технических аспектов',
      'Tips and strategies - игровые советы и стратегии',
      'Community interaction - взаимодействие с игровым сообществом',
      'Achievement moment - момент достижения или победы',
      'Next stream/video - анонс следующего контента',
    ],
    visual_style:
      'gaming setup environment, RGB lighting, high-tech aesthetics, screen recordings',
    mood: 'exciting, competitive, tech-savvy',
    tips: [
      'Показывай лучшие игровые моменты',
      'Объясняй технические детали просто',
      'Взаимодействуй с игровым сообществом',
      'Используй игровую терминологию',
    ],
  },

  // 🌟 Motivational стиль - мотивационный контент
  MOTIVATIONAL: {
    name: 'Motivational Creator',
    description: 'Вдохновляющий и мотивационный контент',
    scenes: [
      'Inspiring quote - вдохновляющая цитата или мысль',
      'Personal struggle - личная история преодоления',
      'Mindset shift - изменение мышления или подхода',
      'Action inspiration - вдохновение к действию',
      'Success visualization - визуализация успеха',
      'Community support - поддержка сообщества',
      'Daily practice - ежедневная практика развития',
      'Transformation moment - момент трансформации',
    ],
    visual_style:
      'inspirational backgrounds, golden hour lighting, uplifting compositions, positive energy',
    mood: 'inspiring, uplifting, empowering',
    tips: [
      'Делись личными историями',
      'Используй вдохновляющие визуалы',
      'Создавай эмоциональную связь',
      'Призывай к позитивным действиям',
    ],
  },
}

// Библейские темы оставляем для специальных случаев
const BIBLE_THEMES = {
  CREATION: {
    scenes: [
      'Divine Light - В начале сотворил Бог небо и землю, и свет отделил от тьмы',
      'Waters Divided - Разделение вод небесных и земных, создание твердого свода',
      'Earth and Seas - Собрание вод в одно место и появление суши с растениями',
      'Celestial Bodies - Сотворение солнца, луны и звезд для освещения земли',
      'Sea Life - Наполнение морей рыбами и небес птицами по роду их',
      'Land Animals - Сотворение зверей земных, скота и гадов по роду их',
      'Human Creation - Сотворение человека по образу и подобию Божию',
      'Divine Rest - День седьмой, благословение и освящение дня покоя',
    ],
    base_style:
      'divine cosmic energy, sacred geometry, mystical atmosphere, ethereal lighting',
  },
}

/**
 * 🎬 Generate text-based scenario scripts for bloggers
 * Создание текстовых сценариев для блогеров и цифровых творцов
 */
export const generateScenarioClips = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'generate-scenario-clips'.
    id: 'content-scenario-clips-generate',
    name: '🎬 Generate Blogger Text Scenarios',
    // Paid OpenAI calls → admin visibility on failure.
    onFailure: createInngestFailureHandler('content-scenario-clips-generate'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [
    { event: 'content/scenario-clips.generate' },
    { event: 'content/generate-scenario-clips' },
  ],
  async ({ event, step, runId, logger: log }) => {
    // Schema failure → NonRetriableError (never heals on retry).
    const input = parseEventData(
      generateScenarioClipsSchema,
      event.data,
      'content/scenario-clips.generate payload'
    )

    // Safe mode: the steps below call the paid OpenAI API.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('openai scenario clips')
      log.warn('🛡️ [SCENARIO CLIPS] safe mode — generation skipped', skipped)
      return { success: false, ...skipped }
    }
    log.info('🎬 Начинаем генерацию текстовых сценариев для блогеров', {
      input,
      runId,
    })

    // Step 1: Validate input and create database record
    const scenarioRecord = await step.run(
      'create-scenario-record',
      async () => {
        log.info('📝 Создаем запись в базе данных')

        // Убираем стоимость за изображения, оставляем только за текст
        const totalScenes = input.scene_count * input.variants_per_scene
        const costPerScene = 0.01 // Стоимость за текстовый сценарий в долларах
        const totalCostStars = ((costPerScene * totalScenes) / 0.016) * 1.5 // Конвертируем в звезды

        const recordData: Partial<ScenarioClipsRecord> = {
          project_id: input.project_id,
          requester_telegram_id: input.requester_telegram_id,
          base_photo_url: input.photo_url, // Оставляем для совместимости, но не используем
          base_prompt: input.prompt,
          scene_count: input.scene_count,
          variants_per_scene: input.variants_per_scene,
          aspect_ratio: input.aspect_ratio,
          flux_model: 'text-only', // Указываем что генерируем только текст
          status: 'PROCESSING',
          total_cost_stars: totalCostStars,
          created_at: new Date(),
        }

        const { data, error } = await supabase
          .from('scenario_clips')
          .insert(recordData)
          .select()
          .single()

        if (error) {
          throw new Error(`Failed to create scenario record: ${error.message}`)
        }

        log.info('✅ Запись создана', { recordId: data.id, totalCostStars })
        return data as ScenarioClipsRecord
      }
    )

    // Step 2: Generate detailed scene scripts using OpenAI
    const detailedScenes = await step.run(
      'generate-detailed-scenes',
      async () => {
        log.info('🧠 Генерируем детальные текстовые сценарии')

        const basePrompt = input.prompt
        const sceneCount = input.scene_count
        const variantsPerScene = input.variants_per_scene
        const bloggerStyle = input.metadata?.blogger_style || 'YOUTUBE'
        const bibleTheme = input.metadata?.bible_theme

        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        })

        const scenes: SceneData[] = []
        let selectedStyle = null

        // Определяем стиль для генерации
        if (bibleTheme === 'CREATION' && BIBLE_THEMES.CREATION) {
          selectedStyle = {
            name: 'Biblical Creation',
            scenes: BIBLE_THEMES.CREATION.scenes,
            tips: [
              'Используй библейские образы',
              'Создавай атмосферу священности',
            ],
          }
        } else if (
          BLOGGER_STYLES[bloggerStyle as keyof typeof BLOGGER_STYLES]
        ) {
          selectedStyle =
            BLOGGER_STYLES[bloggerStyle as keyof typeof BLOGGER_STYLES]
        } else {
          selectedStyle = BLOGGER_STYLES.YOUTUBE // По умолчанию
        }

        log.info(`🎭 Используем стиль: ${selectedStyle.name}`, {
          style: bloggerStyle,
        })

        // Генерируем сцены
        for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex++) {
          const sceneTheme =
            selectedStyle.scenes[sceneIndex] || `Сцена ${sceneIndex + 1}`
          const variants: SceneVariant[] = []

          log.info(
            `📝 Генерируем сцену ${sceneIndex + 1}/${sceneCount}: ${sceneTheme}`
          )

          // Генерируем варианты для каждой сцены
          for (
            let variantIndex = 0;
            variantIndex < variantsPerScene;
            variantIndex++
          ) {
            log.info(
              `✍️ Генерируем вариант ${variantIndex + 1}/${variantsPerScene}`
            )

            const startTime = Date.now()

            // Создаем детальный промпт для текстового сценария
            const systemPrompt = `
Ты - эксперт по созданию сценариев для современных блогеров в стиле "${
              selectedStyle.name
            }".

ЗАДАЧА: Создай детальный текстовый сценарий для сцены блогерского контента.

КОНТЕКСТ:
- Базовая тема: "${basePrompt}"
- Тип сцены: "${sceneTheme}"
- Стиль: ${selectedStyle.name}
- Платформа: ${bloggerStyle}
- Формат: ${input.aspect_ratio}

ТРЕБОВАНИЯ К СЦЕНАРИЮ:
1. Детальное описание происходящего в сцене
2. Диалоги или монолог блогера (если нужно)
3. Ключевые моменты и акценты
4. Технические заметки (движения камеры, реквизит, локация)
5. Эмоциональная составляющая
6. Призыв к действию (если применимо)

СТИЛЬ НАПИСАНИЯ: ${selectedStyle.mood || 'engaging, authentic'}

Создай живой, детальный сценарий длиной 150-300 слов.
`

            const userPrompt = `
Создай сценарий для сцены: "${sceneTheme}"

Вариант: ${variantIndex + 1}
Сделай этот вариант уникальным по подходу, но сохрани суть сцены.
`

            try {
              const response = await openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                temperature: 0.8,
                max_tokens: 800,
              })

              const scenarioText =
                response.choices[0]?.message?.content ||
                `Сценарий для ${sceneTheme} - вариант ${variantIndex + 1}`
              const generationTime = (Date.now() - startTime) / 1000

              variants.push({
                variant_number: variantIndex + 1,
                image_url: '', // Убираем изображения
                prompt_used: scenarioText, // Теперь это детальный сценарий
                flux_model: 'text-only',
                generation_time: generationTime,
                metadata: {
                  blogger_style: bloggerStyle,
                  scene_theme: sceneTheme,
                  text_length: scenarioText.length,
                  generation_source: 'openai-gpt4',
                },
              })

              log.info(`✅ Текстовый сценарий ${variantIndex + 1} создан`, {
                length: scenarioText.length,
                generationTime: `${generationTime}s`,
              })
            } catch (error) {
              log.error(
                `❌ Ошибка генерации сценария ${variantIndex + 1}:`,
                error
              )

              // Fallback сценарий
              variants.push({
                variant_number: variantIndex + 1,
                image_url: '',
                prompt_used: `Детальный сценарий для "${sceneTheme}" - вариант ${
                  variantIndex + 1
                }. 
              
ОПИСАНИЕ СЦЕНЫ: ${sceneTheme.split(' - ')[1] || sceneTheme}

ДЕЙСТВИЕ: Блогер представляет основную идею сцены в стиле ${selectedStyle.name}.

ДИАЛОГ: "Привет, друзья! Сегодня мы разберем ${basePrompt}..."

ТЕХНИКА: Съемка в ${input.aspect_ratio} формате, ${selectedStyle.visual_style}

ЭМОЦИЯ: ${selectedStyle.mood}`,
                flux_model: 'text-only',
                generation_time: 0,
                metadata: {
                  blogger_style: bloggerStyle,
                  status: 'fallback',
                },
              })
            }
          }

          scenes.push({
            scene_number: sceneIndex + 1,
            scene_prompt: sceneTheme,
            variants: variants,
            theme: sceneTheme.split(' - ')[0] || `Сцена ${sceneIndex + 1}`,
          })
        }

        // Сохраняем информацию о стиле для отчета
        if (selectedStyle) {
          const updatedMetadata = {
            ...((scenarioRecord.metadata || {}) as Record<string, any>),
            blogger_style: bloggerStyle,
            style_info: {
              name: selectedStyle.name,
              description: selectedStyle.description || selectedStyle.name,
              tips: selectedStyle.tips || [],
            },
          }

          // Обновляем метаданные в записи
          await supabase
            .from('scenario_clips')
            .update({ metadata: updatedMetadata })
            .eq('id', scenarioRecord.id)
        }

        log.info('✅ Все текстовые сценарии созданы', {
          totalScenes: scenes.length,
          totalVariants: scenes.reduce(
            (acc, scene) => acc + scene.variants.length,
            0
          ),
          blogger_style: bloggerStyle,
        })

        return scenes
      }
    )

    // Step 3: Create text-based reports and archive
    const archiveResult = await step.run(
      'create-text-reports-archive',
      async () => {
        log.info('📋 Создаем текстовые отчеты и архив')

        try {
          const reportGenerator = new TextScenarioReportGenerator('./output')
          const bloggerStyle = input.metadata?.blogger_style || 'YOUTUBE'

          const metadata: ScenarioReportMetadata = {
            base_photo_url: '', // Убираем фото
            base_prompt: input.prompt,
            total_scenes: input.scene_count,
            total_variants: input.variants_per_scene,
            total_images: 0, // Изображений нет
            aspect_ratio: input.aspect_ratio,
            flux_model: 'text-only',
            generation_date: new Date(),
            processing_time: 0, // Будет рассчитано позже
            cost_breakdown: {
              total_stars: scenarioRecord.total_cost_stars,
              cost_per_image: 0, // Изображений нет
              estimated_rubles: scenarioRecord.total_cost_stars * 0.016 * 100,
            },
            blogger_style: bloggerStyle,
            style_info:
              BLOGGER_STYLES[bloggerStyle as keyof typeof BLOGGER_STYLES] ||
              null,
          }

          // Генерируем HTML отчет с текстовыми сценариями
          const htmlPath = await reportGenerator.generateTextScenarioHTMLReport(
            detailedScenes as SceneData[],
            metadata,
            log
          )

          // Генерируем Excel файл с текстовыми сценариями
          const excelPath =
            await reportGenerator.generateTextScenarioExcelReport(
              detailedScenes as SceneData[],
              metadata
            )

          // Создаем ZIP архив с текстовыми материалами
          const archivePath = await reportGenerator.createTextScenarioArchive(
            htmlPath,
            excelPath,
            metadata,
            log
          )

          log.info('✅ Текстовые отчеты и архив созданы')

          return {
            success: true,
            htmlReportPath: htmlPath,
            excelReportPath: excelPath,
            archivePath: archivePath,
            archiveFileName: path.basename(archivePath),
          } as const
        } catch (error) {
          log.error('❌ Ошибка создания текстовых отчетов:', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          } as const
        }
      }
    )

    // Step 4: Update database record with results
    const finalResult = await step.run('update-scenario-record', async () => {
      log.info('💾 Обновляем запись в базе данных')

      const processingTime =
        (Date.now() - new Date(scenarioRecord.created_at).getTime()) / 1000

      const updateData = {
        generated_scenes: detailedScenes,
        archive_path: archiveResult.success
          ? (archiveResult as any).archivePath
          : null,
        html_report_path: archiveResult.success
          ? (archiveResult as any).htmlReportPath
          : null,
        excel_report_path: archiveResult.success
          ? (archiveResult as any).excelReportPath
          : null,
        status: archiveResult.success ? 'COMPLETED' : 'FAILED',
        error_message: archiveResult.success
          ? null
          : (archiveResult as any).error,
        processing_time_seconds: processingTime,
        completed_at: new Date(),
      }

      const { error } = await supabase
        .from('scenario_clips')
        .update(updateData)
        .eq('id', scenarioRecord.id)

      if (error) {
        log.error('❌ Ошибка обновления записи:', error)
      } else {
        log.info('✅ Запись обновлена успешно')
      }

      return {
        success: true,
        record_id: scenarioRecord.id,
        total_scenes: detailedScenes.length,
        total_scenarios: detailedScenes.reduce(
          (acc, scene) => acc + scene.variants.length,
          0
        ),
        processing_time_seconds: processingTime,
        archive_created: archiveResult.success,
        archive_path: archiveResult.success
          ? (archiveResult as any).archivePath
          : null,
        blogger_style: input.metadata?.blogger_style || 'YOUTUBE',
      }
    })

    log.info(
      '🎉 Генерация текстовых блогерских сценариев завершена!',
      finalResult
    )

    return {
      success: true,
      data: {
        record_id: scenarioRecord.id,
        scenarios: detailedScenes, // Переименовали с scenes
        archive: archiveResult.success
          ? {
              path: (archiveResult as any).archivePath,
              filename: (archiveResult as any).archiveFileName,
            }
          : null,
        metadata: {
          total_cost_stars: scenarioRecord.total_cost_stars,
          processing_time: finalResult.processing_time_seconds,
          total_scenarios: finalResult.total_scenarios,
          blogger_style: finalResult.blogger_style,
          content_type: 'text-only',
          platform_optimized:
            input.aspect_ratio === '16:9'
              ? 'YouTube'
              : input.aspect_ratio === '9:16'
                ? 'TikTok/Reels'
                : 'Instagram',
        },
      },
    }
  }
)

/**
 * 📝 Класс для генерации текстовых отчетов о сценариях
 */
class TextScenarioReportGenerator {
  constructor(private outputDir: string) {}

  async generateTextScenarioHTMLReport(
    scenes: SceneData[],
    metadata: ScenarioReportMetadata & {
      blogger_style?: string
      style_info?: any
    },
    log: any
  ): Promise<string> {
    const styleInfo = metadata.style_info
    const bloggerStyle = metadata.blogger_style || 'YOUTUBE'

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📝 Блогерские Сценарии - ${
      scenes.length
    } Сцен (${bloggerStyle})</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b6b, #ffa500);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .blogger-style-badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            padding: 10px 20px;
            border-radius: 25px;
            margin: 10px;
            font-weight: bold;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 40px;
            background: #f8f9fa;
        }
        
        .stat-card {
            background: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card .number {
            font-size: 3rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }

        .blogger-tips {
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
            color: white;
            padding: 30px;
            margin: 20px 0;
        }

        .tips-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }

        .tip-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 10px;
            border-left: 4px solid rgba(255, 255, 255, 0.5);
        }
        
        .scenarios-grid {
            padding: 40px;
        }
        
        .scene-card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        
        .scene-header {
            border-bottom: 3px solid #667eea;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }

        .platform-optimization {
            display: inline-block;
            background: #28a745;
            color: white;
            padding: 5px 15px;
            border-radius: 15px;
            font-size: 0.8rem;
            margin-left: 10px;
        }
        
        .variants-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
            margin-top: 20px;
        }
        
        .variant-card {
            border: 1px solid #e0e0e0;
            border-radius: 10px;
            padding: 20px;
            background: #f9f9f9;
        }
        
        .scenario-text {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            font-size: 1.1rem;
            line-height: 1.7;
            border-left: 4px solid #667eea;
        }

        .scenario-metadata {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            font-size: 0.9rem;
            margin-top: 15px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
        }
        
        .footer {
            background: #333;
            color: white;
            padding: 30px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>📝 Блогерские Сценарии</h1>
            <div class="subtitle">"${metadata.base_prompt}"</div>
            <div class="blogger-style-badge">🎭 Стиль: ${
              styleInfo?.name || bloggerStyle
            }</div>
            <div class="blogger-style-badge">📺 Платформа: ${
              metadata.aspect_ratio === '16:9'
                ? 'YouTube'
                : metadata.aspect_ratio === '9:16'
                  ? 'TikTok/Reels'
                  : 'Instagram'
            }</div>
            <div class="blogger-style-badge">📝 Только текст</div>
        </header>

        ${
          styleInfo
            ? `
        <section class="blogger-tips">
            <h2>💡 Советы для стиля "${styleInfo.name}"</h2>
            <p><strong>Описание:</strong> ${styleInfo.description}</p>
            <div class="tips-grid">
                ${
                  styleInfo.tips
                    ?.map(
                      (tip: string) => `
                    <div class="tip-item">💎 ${tip}</div>
                `
                    )
                    .join('') || ''
                }
            </div>
        </section>
        `
            : ''
        }
        
        <section class="stats">
            <div class="stat-card">
                <div class="number">${metadata.total_scenes}</div>
                <div class="label">🎭 Сцен</div>
            </div>
            <div class="stat-card">
                <div class="number">${metadata.total_variants}</div>
                <div class="label">📝 Вариантов на сцену</div>
            </div>
            <div class="stat-card">
                <div class="number">${scenes.reduce(
                  (acc, scene) => acc + scene.variants.length,
                  0
                )}</div>
                <div class="label">📄 Всего сценариев</div>
            </div>
            <div class="stat-card">
                <div class="number">${metadata.cost_breakdown.total_stars}</div>
                <div class="label">⭐ Стоимость в звездах</div>
            </div>
        </section>
        
        <section class="scenarios-grid">
            <h2 class="section-title">📝 Детальные сценарии для блога</h2>
            ${scenes
              .map(
                (scene, _index) => `
                <div class="scene-card">
                    <div class="scene-header">
                        <h3>Сцена ${scene.scene_number}: ${scene.theme}
                            <span class="platform-optimization">${bloggerStyle}</span>
                        </h3>
                        <p><strong>Тип сцены:</strong> ${scene.scene_prompt}</p>
                    </div>
                    <div class="variants-grid">
                        ${scene.variants
                          .map(
                            variant => `
                            <div class="variant-card">
                                <h4>📄 Вариант сценария ${
                                  variant.variant_number
                                }</h4>
                                <div class="scenario-text">
                                    ${variant.prompt_used.replace(
                                      /\n/g,
                                      '<br>'
                                    )}
                                </div>
                                <div class="scenario-metadata">
                                    <div><strong>⏱️ Время генерации:</strong> ${
                                      variant.generation_time
                                    }s</div>
                                    <div><strong>📏 Длина текста:</strong> ${
                                      variant.metadata?.text_length || 'N/A'
                                    } символов</div>
                                    <div><strong>🎭 Стиль:</strong> ${
                                      variant.metadata?.blogger_style ||
                                      bloggerStyle
                                    }</div>
                                    <div><strong>🎯 Источник:</strong> ${
                                      variant.metadata?.generation_source ||
                                      'AI Generated'
                                    }</div>
                                </div>
                            </div>
                        `
                          )
                          .join('')}
                    </div>
                </div>
            `
              )
              .join('')}
        </section>
        
        <footer class="footer">
            <p>📊 Текстовые сценарии созданы ${metadata.generation_date.toLocaleDateString(
              'ru-RU'
            )} в ${metadata.generation_date.toLocaleTimeString('ru-RU')}</p>
            <p>📝 Text Scenario Generator - Optimized for ${bloggerStyle}</p>
            <p>🚀 Готовые сценарии для создания контента!</p>
        </footer>
    </div>
</body>
</html>
    `

    const fileName = `text_scenarios_${bloggerStyle.toLowerCase()}_${Date.now()}.html`
    const filePath = path.join(this.outputDir, fileName)

    await fs.promises.mkdir(this.outputDir, { recursive: true })
    await fs.promises.writeFile(filePath, html, 'utf-8')

    log.info(`📄 HTML отчёт с текстовыми сценариями создан: ${fileName}`)
    return filePath
  }

  async generateTextScenarioExcelReport(
    scenes: SceneData[],
    metadata: ScenarioReportMetadata & {
      blogger_style?: string
      style_info?: any
    }
  ): Promise<string> {
    const workbook = XLSX.utils.book_new()
    const bloggerStyle = metadata.blogger_style || 'YOUTUBE'

    // Лист "Сценарии"
    const scenariosData = scenes.flatMap(scene =>
      scene.variants.map(variant => ({
        '№ Сцены': scene.scene_number,
        'Название сцены': scene.theme || `Сцена ${scene.scene_number}`,
        'Тип сцены': scene.scene_prompt,
        '№ Варианта': variant.variant_number,
        'Текст сценария': variant.prompt_used,
        'Длина текста': variant.metadata?.text_length || 0,
        'Блогерский стиль': variant.metadata?.blogger_style || bloggerStyle,
        'Время генерации (сек)': variant.generation_time,
        Платформа:
          metadata.aspect_ratio === '16:9'
            ? 'YouTube'
            : metadata.aspect_ratio === '9:16'
              ? 'TikTok/Reels'
              : 'Instagram',
        Статус: variant.metadata?.status || 'Готово',
      }))
    )

    const scenariosSheet = XLSX.utils.json_to_sheet(scenariosData)
    XLSX.utils.book_append_sheet(workbook, scenariosSheet, 'Сценарии')

    // Лист "Краткий план"
    const summaryData = scenes.map((scene, _index) => ({
      '№ Сцены': scene.scene_number,
      Название: scene.theme || `Сцена ${scene.scene_number}`,
      Тип: scene.scene_prompt,
      'Количество вариантов': scene.variants.length,
      'Общая длина текста': scene.variants.reduce(
        (acc, v) => acc + (v.metadata?.text_length || 0),
        0
      ),
      'Блогерский стиль': bloggerStyle,
      Статус: 'Готово к использованию',
    }))

    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Краткий план')

    // Лист "Аналитика"
    const styleInfo = metadata.style_info
    const totalTextLength = scenes.reduce(
      (acc, scene) =>
        acc +
        scene.variants.reduce(
          (acc2, variant) => acc2 + (variant.metadata?.text_length || 0),
          0
        ),
      0
    )

    const analyticsData = [
      {
        'Блогерский стиль': styleInfo?.name || bloggerStyle,
        'Описание стиля':
          styleInfo?.description || 'Современный блогерский контент',
        'Общее количество сцен': metadata.total_scenes,
        'Вариантов на сцену': metadata.total_variants,
        'Всего сценариев': scenes.reduce(
          (acc, scene) => acc + scene.variants.length,
          0
        ),
        'Общая длина текста': totalTextLength,
        'Средняя длина сценария': Math.round(
          totalTextLength /
            scenes.reduce((acc, scene) => acc + scene.variants.length, 0)
        ),
        'Соотношение сторон': metadata.aspect_ratio,
        'Оптимизация для платформы':
          metadata.aspect_ratio === '16:9'
            ? 'YouTube (горизонтальное)'
            : metadata.aspect_ratio === '9:16'
              ? 'TikTok/Reels (вертикальное)'
              : 'Instagram (квадрат)',
        'Тип контента': 'Только текст',
        'Стоимость в звездах': metadata.cost_breakdown.total_stars,
        'Дата генерации': metadata.generation_date.toLocaleDateString('ru-RU'),
        'Время обработки (сек)': metadata.processing_time,
        'Готовность к использованию': 'Да',
      },
    ]

    const analyticsSheet = XLSX.utils.json_to_sheet(analyticsData)
    XLSX.utils.book_append_sheet(workbook, analyticsSheet, 'Аналитика')

    // Лист "Советы блогерам"
    if (styleInfo && styleInfo.tips) {
      const tipsData = styleInfo.tips.map((tip: string, index: number) => ({
        '№': index + 1,
        Совет: tip,
        Применение: 'Используйте при создании контента',
        Стиль: styleInfo.name,
      }))

      const tipsSheet = XLSX.utils.json_to_sheet(tipsData)
      XLSX.utils.book_append_sheet(workbook, tipsSheet, 'Советы блогерам')
    }

    const fileName = `text_scenarios_${bloggerStyle.toLowerCase()}_data_${Date.now()}.xlsx`
    const filePath = path.join(this.outputDir, fileName)

    await fs.promises.mkdir(this.outputDir, { recursive: true })
    XLSX.writeFile(workbook, filePath)

    return filePath
  }

  async createTextScenarioArchive(
    htmlPath: string,
    excelPath: string,
    metadata: ScenarioReportMetadata & {
      blogger_style?: string
      style_info?: any
    },
    log: any
  ): Promise<string> {
    const bloggerStyle = metadata.blogger_style || 'YOUTUBE'
    const archiveName = `text_scenarios_${bloggerStyle.toLowerCase()}_${Date.now()}.zip`
    const archivePath = path.join(this.outputDir, archiveName)

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => {
        log.info(
          `📦 Архив текстовых сценариев создан: ${archiveName} (${archive.pointer()} bytes)`
        )
        resolve(archivePath)
      })

      archive.on('error', err => {
        log.error('❌ Ошибка создания архива сценариев:', err)
        reject(err)
      })

      // pipe() does not forward destination errors to the source, and
      // archive.on('error') covers only archiver-internal faults. Without this
      // an output write error (ENOSPC/EMFILE/EACCES) is an unhandled emitter
      // 'error' -> uncaughtException -> process.exit(1) kills every bot.
      output.on('error', err => {
        log.error('❌ Ошибка записи архива сценариев:', err)
        reject(err)
      })

      archive.pipe(output)

      // Добавляем файлы в архив
      archive.file(htmlPath, { name: path.basename(htmlPath) })
      archive.file(excelPath, { name: path.basename(excelPath) })

      // Создаём README для текстовых сценариев
      const readmeContent = `
# 📝 Текстовые Сценарии для Блогеров: ${metadata.blogger_style}

## 🚀 Описание
Этот архив содержит готовые текстовые сценарии для создания блогерского контента

## 📱 Оптимизировано для:
${
  metadata.aspect_ratio === '16:9'
    ? '🎥 YouTube (горизонтальные видео)'
    : metadata.aspect_ratio === '9:16'
      ? '📱 TikTok & Instagram Reels (вертикальные видео)'
      : '📸 Instagram Posts (квадратные изображения)'
}

## 🎭 Стиль: ${metadata.style_info?.name || metadata.blogger_style}
${
  metadata.style_info?.description ||
  'Современный блогерский контент для социальных сетей'
}

## 📦 Содержимое архива:
- 📄 **HTML отчёт** - красивое отображение всех сценариев
- 📊 **Excel файл** - данные для работы и планирования
- 📝 **README.txt** - данная инструкция

## 📊 Excel листы:
- **"Сценарии"** - полные тексты всех сценариев
- **"Краткий план"** - обзор всех сцен
- **"Аналитика"** - статистика и метрики
- **"Советы блогерам"** - рекомендации по стилю

## 💡 Советы по использованию:
${
  metadata.style_info?.tips
    ?.map((tip: string, i: number) => `${i + 1}. ${tip}`)
    .join('\n') || 'Используйте сценарии как основу для вашего контента!'
}

## 🎯 Как использовать сценарии:
1. **Откройте HTML** - для удобного чтения всех сценариев
2. **Изучите Excel** - для копирования текстов в ваши проекты
3. **Адаптируйте тексты** - добавьте свой стиль и особенности
4. **Создайте контент** - используйте сценарии как основу для съёмок

## 📈 Статистика:
- 🎬 Сцен: ${metadata.total_scenes}
- 📝 Вариантов на сцену: ${metadata.total_variants}  
- 📄 Всего сценариев: ${metadata.total_scenes * metadata.total_variants}
- ⭐ Стоимость: ${metadata.cost_breakdown.total_stars} звезд
- ⏱️ Время: ${metadata.processing_time} секунд

## 🎥 Рекомендации по съёмке:
${
  metadata.aspect_ratio === '16:9'
    ? '✅ Горизонтальная съёмка для YouTube\n✅ Длительность: 3-15+ минут\n✅ Образовательный формат\n✅ Четкая структура'
    : metadata.aspect_ratio === '9:16'
      ? '✅ Вертикальная съёмка для TikTok/Reels\n✅ Длительность: 15-60 секунд\n✅ Быстрый темп\n✅ Хуки в начале'
      : '✅ Квадратная съёмка для Instagram\n✅ Эстетичная подача\n✅ Lifestyle контент\n✅ Естественные цвета'
}

## 🚀 Готово к использованию!
Все сценарии готовы для создания контента. Просто следуйте тексту и добавляйте свою уникальность!

---
## 📅 Создано: ${metadata.generation_date.toLocaleDateString(
        'ru-RU'
      )} в ${metadata.generation_date.toLocaleTimeString('ru-RU')}
## 🤖 Text Scenario Generator - AI-Powered Content Creation
## 📝 Стиль: ${metadata.blogger_style} | Формат: ${metadata.aspect_ratio}

Успехов в создании крутого контента! 🌟
      `

      archive.append(readmeContent, { name: 'README_сценарии.txt' })

      archive.finalize()
    })
  }
}
