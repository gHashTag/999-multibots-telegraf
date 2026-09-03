import type { AgentTool, ToolContext } from './tools'

type PriceBook = Record<
  'image_generate' | 'audio_generate' | 'video_generate' | 'reel_render',
  number
>

const SCENE_BEATS = [
  'hook',
  'hero',
  'process',
  'detail',
  'scale',
  'finale',
] as const

export const CINEMATIC_SIX_SCENE_V1 = {
  key: 'cinematic-six-scene-v1',
  version: 1,
  purpose: 'club-welcome-and-reusable-topic-story',
  compositionId: 'SplitTalkingHead',
  aspectRatio: '9:16',
  width: 1080,
  height: 1920,
  fps: 30,
  targetDurationSeconds: 12.4,
  sceneBeats: SCENE_BEATS,
  style: {
    filmGrainOpacity: 0.13,
    filmFlickerStrength: 0.016,
    vignetteStrength: 0.24,
    colorCorrection: 0.97,
  },
  captions: {
    source: 'final-audio-word-timestamps',
    fontFamily: 'Montserrat',
    fontWeight: 900,
    fontSize: 60,
    textColor: '#F2E9D8',
    showShadow: true,
    layer: 'above-film-effects',
  },
  audio: {
    mode: 'one-continuous-master-track',
    visualLipSyncLayersMuted: true,
  },
  presenter: {
    mode: 'owner-avatar-throughout-story',
    animatePerSceneWindow: true,
    keepVisibleAsPictureInPictureOverBRoll: true,
  },
  clubWelcomeStory: [
    {
      beat: 'hook',
      function: 'welcome',
      message:
        'Добро пожаловать в Trinity S³AI — клуб, где контент делает ваш агент.',
    },
    {
      beat: 'hero',
      function: 'verified-profile',
      message:
        'Он работает внутри вашего подтверждённого профиля и знает ваш стиль.',
    },
    {
      beat: 'process',
      function: 'content-plan',
      message: 'Из разговора собирает контент-план, сценарии и черновики.',
    },
    {
      beat: 'detail',
      function: 'creative-production',
      message: 'Создаёт изображения, голос, видео, титры и собирает рилс.',
    },
    {
      beat: 'scale',
      function: 'agent-connections',
      message:
        'К профилю можно подключить своего агента через Telegram или MCP.',
    },
    {
      beat: 'finale',
      function: 'owner-control',
      message:
        'А публикации и расходы запускаются только после вашего подтверждения.',
    },
  ],
  clubWelcomeVoiceDraft:
    'Добро пожаловать в Trinity S³AI. Здесь ваш агент изучает профиль, создаёт ' +
    'контент-план, изображения, голос, видео и готовые рилсы. Подключайте своего ' +
    'агента через Telegram или MCP. Расходы и публикации — только с вашего подтверждения.',
  qualityGate: {
    maxAudioVisualOnsetErrorFrames: 2,
    outputFps: 30,
    interpolateProviderFrames: true,
    videoCrf: 18,
    videoPreset: 'slow',
    audioBitrate: '192k',
    premiumAvatarPreference: [
      'kling/ai-avatar-v2-pro-1080p-48fps',
      'omnihuman-1-5-1080p',
    ],
    quoteProviderCostBeforeExecution: true,
  },
  economy: {
    animateOnlySceneWindow: true,
    reuseOwnerAssetsFirst: true,
    fullLengthTalkingPortrait: false,
  },
} as const

const LIMITS = {
  name: 120,
  topic: 300,
  goal: 500,
  voice: 1800,
  prompt: 1200,
  sourceUrl: 2048,
} as const

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function validReferenceUrl(value: unknown): string | null {
  const raw = clean(value, LIMITS.sourceUrl)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseRecipe(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function createReelTemplateTools(prices: PriceBook): AgentTool[] {
  return [
    {
      name: 'reel_templates_list',
      description:
        'Мои приватные повторяемые стили рилсов. Используй первым, когда человек говорит ' +
        '«в таком же стиле», «по аналогии» или просит второй ролик. Бесплатно.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      async handler(_args, ctx) {
        let result: { rows: any[] }
        try {
          result = await ctx.pool.query(
            `SELECT id, name, source_video_url, recipe::text, updated_at::text
               FROM user_reel_templates
              WHERE telegram_id = $1
              ORDER BY updated_at DESC
              LIMIT 50`,
            [ctx.telegramId]
          )
        } catch (error) {
          if ((error as { code?: string })?.code === '42P01') {
            return { всего: 0, шаблоны: [] }
          }
          throw error
        }
        return {
          всего: result.rows.length,
          шаблоны: result.rows.map(row => ({
            id: Number(row.id),
            имя: String(row.name),
            референс: row.source_video_url || undefined,
            рецепт: parseRecipe(row.recipe),
            обновлён: row.updated_at,
          })),
        }
      },
    },
    {
      name: 'reel_template_save',
      description:
        'Сохранить или обновить в МОЁМ профиле приватный параметризованный шаблон ' +
        '«Киноплёнка · 6 сцен». Это не публикация и не генерация: списаний нет.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: LIMITS.name },
          source_video_url: {
            type: 'string',
            description: 'HTTPS-ссылка на удачный ролик-референс',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      async handler(args, ctx) {
        const name = clean(args.name, LIMITS.name)
        if (!name) return { сохранено: false, причина: 'нужно имя шаблона' }
        const source = args.source_video_url
          ? validReferenceUrl(args.source_video_url)
          : null
        if (args.source_video_url && !source) {
          return {
            сохранено: false,
            причина: 'референс должен быть безопасной HTTPS-ссылкой без логина',
          }
        }

        let result: { rows: any[] }
        try {
          result = await ctx.pool.query(
            `INSERT INTO user_reel_templates
               (telegram_id, name, source_video_url, recipe, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, now())
             ON CONFLICT (telegram_id, name) DO UPDATE
                SET source_video_url = COALESCE(
                      EXCLUDED.source_video_url,
                      user_reel_templates.source_video_url
                    ),
                    recipe = EXCLUDED.recipe,
                    updated_at = now()
             RETURNING id, updated_at::text`,
            [
              ctx.telegramId,
              name,
              source,
              JSON.stringify(CINEMATIC_SIX_SCENE_V1),
            ]
          )
        } catch (error) {
          if ((error as { code?: string })?.code === '42P01') {
            return {
              сохранено: false,
              причина: 'хранилище шаблонов ещё не подготовлено',
              migration_required: true,
            }
          }
          throw error
        }
        return {
          сохранено: true,
          приватно: true,
          id: Number(result.rows[0].id),
          имя: name,
          compositionId: CINEMATIC_SIX_SCENE_V1.compositionId,
          списано: 0,
          опубликовано: false,
        }
      },
    },
    {
      name: 'reel_from_template_prepare',
      description:
        'Подготовить второй рилс на любую тему по приватному шаблону: сценарий, ровно ' +
        '6 связанных сцен и смету. Сохраняет только draft; ничего не генерирует, не ' +
        'рендерит и не публикует. После результата дождись явного «делай».',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'integer', minimum: 1 },
          topic: { type: 'string', minLength: 1, maxLength: LIMITS.topic },
          goal: { type: 'string', maxLength: LIMITS.goal },
          voice_text: {
            type: 'string',
            minLength: 1,
            maxLength: LIMITS.voice,
            description: 'готовый текст будущей мастер-дорожки',
          },
          scenes: {
            type: 'array',
            minItems: 6,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                beat: { type: 'string', enum: [...SCENE_BEATS] },
                prompt: {
                  type: 'string',
                  minLength: 1,
                  maxLength: LIMITS.prompt,
                },
              },
              required: ['beat', 'prompt'],
              additionalProperties: false,
            },
          },
          new_image_count: { type: 'integer', minimum: 0, maximum: 6 },
          animate_scene_count: { type: 'integer', minimum: 0, maximum: 6 },
        },
        required: ['template_id', 'topic', 'voice_text', 'scenes'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      async handler(args, ctx) {
        const topic = clean(args.topic, LIMITS.topic)
        const voiceText = clean(args.voice_text, LIMITS.voice)
        const scenes = Array.isArray(args.scenes) ? args.scenes : []
        const validScenes =
          scenes.length === 6 &&
          scenes.every(
            (scene, index) =>
              scene &&
              scene.beat === SCENE_BEATS[index] &&
              clean(scene.prompt, LIMITS.prompt).length > 0
          )
        if (!topic || !voiceText || !validScenes) {
          return {
            подготовлено: false,
            причина:
              'нужны тема, текст голоса и ровно 6 сцен в порядке hook→hero→process→detail→scale→finale',
          }
        }
        const templateId = Number(args.template_id)
        if (!Number.isSafeInteger(templateId) || templateId < 1) {
          return { подготовлено: false, причина: 'неверный template_id' }
        }
        const imageCount = Math.min(
          6,
          Math.max(0, Number(args.new_image_count ?? 6))
        )
        const animatedCount = Math.min(
          6,
          Math.max(0, Number(args.animate_scene_count ?? 6))
        )

        let template: { rows: any[] }
        try {
          template = await ctx.pool.query(
            `SELECT id, name, source_video_url, recipe::text
               FROM user_reel_templates
              WHERE id = $1 AND telegram_id = $2`,
            [templateId, ctx.telegramId]
          )
        } catch (error) {
          if ((error as { code?: string })?.code === '42P01') {
            return {
              подготовлено: false,
              причина: 'хранилище шаблонов ещё не подготовлено',
              migration_required: true,
            }
          }
          throw error
        }
        if (!template.rows.length) {
          return {
            подготовлено: false,
            причина: 'шаблон не найден (или чужой)',
          }
        }

        const estimatedTokens =
          imageCount * prices.image_generate +
          prices.audio_generate +
          animatedCount * prices.video_generate +
          prices.reel_render
        const storyboard = {
          schema: 'agent-reel-draft-v1',
          template: parseRecipe(template.rows[0].recipe),
          referenceVideoUrl: template.rows[0].source_video_url || undefined,
          topic,
          goal: clean(args.goal, LIMITS.goal) || undefined,
          voiceText,
          scenes: scenes.map((scene, index) => ({
            beat: SCENE_BEATS[index],
            prompt: clean(scene.prompt, LIMITS.prompt),
          })),
          cost: {
            newImages: imageCount,
            animatedScenes: animatedCount,
            estimatedAppTokens: estimatedTokens,
            providerCredits: 'quote-before-execution',
          },
        }
        const draft = await ctx.pool.query(
          `INSERT INTO agent_reel_drafts
             (telegram_id, template_id, topic, storyboard, status, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, 'draft', now())
           ON CONFLICT (telegram_id, template_id, topic) DO UPDATE
              SET storyboard = EXCLUDED.storyboard,
                  status = 'draft',
                  updated_at = now()
           RETURNING id, updated_at::text`,
          [ctx.telegramId, templateId, topic, JSON.stringify(storyboard)]
        )
        return {
          подготовлено: true,
          draft_id: Number(draft.rows[0].id),
          status: 'draft',
          template: String(template.rows[0].name),
          estimated_app_tokens: estimatedTokens,
          provider_credits: 'будут уточнены до запуска',
          requires_owner_confirmation: true,
          paid_generation_started: false,
          publication_started: false,
          следующий_шаг:
            `Покажи сценарий, 6 сцен и смету. Запускай платные инструменты только после ` +
            `явного ответа владельца «делай рилс ${Number(draft.rows[0].id)}».`,
        }
      },
    },
  ]
}
