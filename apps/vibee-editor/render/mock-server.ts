/**
 * MOCK-СЕРВЕР — эмуляция ответов ВСЕХ функций для тестирования без бэкендов.
 *
 * ЗАЧЕМ. Провайдеры мрут (FAL/ElevenLabs), деплой Railway пропускает render-
 * правки, параллельные агенты дают конфликты. Чтобы протестировать таб с ИИ,
 * агента и ленту НЕ дожидаясь ничего — этот сервер отдаёт готовые (mock)
 * ответы на каждую функцию, мгновенно и бесплатно. Образцы — реальные
 * артефакты, сделанные в этой сессии (рилсы, сцены, данные ленты из аудита).
 *
 * Запуск:  make mock   (или npx tsx mock-server.ts)  → http://localhost:3336
 * Мини-апп/агент направляй сюда (API_BASE=http://localhost:3336), и все кнопки
 * «работают»: возвращают образец. Ничего не тратится, ничего не ломается.
 *
 * НЕ для прода. Только локальная эмуляция.
 */
import { createServer } from 'node:http'
import { priceFor } from './src/agent/billing-shared'

const PORT = Number(process.env.MOCK_PORT || 3336)

// ── Реальные образцы из этой сессии (уже отрендерены/сгенерены) ──────────────
const S = {
  reel: 'https://bucket-production-8259.up.railway.app/vibee-assets/renders/1787912936286-f1fbca0a-8bdb-4d85-ad84-dfdd70ce529d.mp4',
  reelPip:
    'https://bucket-production-8259.up.railway.app/vibee-assets/renders/1787915527491-8326cd6d-ee77-4820-b1da-e4a2ff49a6bc.mp4',
  engraving:
    'https://bucket-production-8259.up.railway.app/vibee-assets/renders/1787912684411-015f4741-0b1f-4786-80ff-59d850ac38f7.mp4',
  scene: 'https://files.catbox.moe/941yaw.jpg',
  storyReel: 'https://files.catbox.moe/fwly87.mp4',
  audio:
    'https://bucket-production-8259.up.railway.app/vibee-assets/assets/mock-voice.mp3',
  avatar:
    'https://t.me/i/userpic/320/tR0QjJduOxMDGPYL3G5eItFtmnJq4LRa1WPzaQwiBbg.svg',
}

// ── Эмуляция ответа КАЖДОГО из 32 инструментов агента ────────────────────────
// Формы взяты из живого аудита /mcp — чтобы клиент не заметил разницы.
const TOOL: Record<string, (a: any) => any> = {
  whoami: () => ({
    telegram_id: '144022504',
    профиль: {
      telegram_id: '144022504',
      username: 't27_dev',
      first_name: 'Dmitrii T27 DEV',
      display_name: 'Dmitrii T27 DEV',
      avatar_url: S.avatar,
    },
    опубликовано: 26,
    аватар: S.avatar,
    режим: 'MOCK',
  }),
  feed_stats: () => ({ авторов: 2, роликов: 26, просмотров: 79, лайков: 3 }),
  feed_analytics: () => ({
    постов: 26,
    просмотров: 79,
    звёзд: 3,
    ремиксов: 9,
    среднее_просмотров: 3,
    лучший_пост: { id: '27', name: 'Ретрай стоит дёшево', просмотров: 12 },
  }),
  feed_list: a => ({
    всего: Math.min(a?.limit || 3, 3),
    записи: [
      {
        id: '27',
        creator_name: 'Dmitrii T27 DEV',
        creator_username: 't27_dev',
        name: 'Ретрай стоит дёшево, потеря — дорого',
        video_url: S.engraving,
        views_count: 12,
        stars_count: 1,
      },
      {
        id: '26',
        creator_name: 'Dmitrii T27 DEV',
        creator_username: 't27_dev',
        name: 'Наблюдаемость — ров автономности',
        video_url: S.reel,
        views_count: 8,
        stars_count: 0,
      },
      {
        id: '25',
        creator_name: 'Dmitrii T27 DEV',
        creator_username: 't27_dev',
        name: 'Stars решают то, что картам нельзя',
        video_url: S.storyReel,
        views_count: 5,
        stars_count: 2,
      },
    ].slice(0, a?.limit || 3),
  }),
  feed_get: a => ({
    найдено: true,
    запись: {
      id: String(a?.id ?? 27),
      telegram_id: '144022504',
      creator_name: 'Dmitrii T27 DEV',
      name: 'Ретрай стоит дёшево',
      description: 'Демо #trinity #mock',
      video_url: S.engraving,
      views_count: 12,
    },
  }),
  feed_publish: a => ({
    опубликовано: true,
    id: '99',
    создано: new Date().toISOString(),
    название: a?.name || 'mock',
    в_ленте: true,
  }),
  feed_unpublish: a => ({ снято: true, id: String(a?.id ?? 99) }),
  templates_list: () => ({
    compositions: [
      {
        id: 'SplitTalkingHead',
        width: 1080,
        height: 1920,
        fps: 30,
        tagline: 'Говорящая голова + b-roll',
      },
      {
        id: 'NoirReel',
        width: 1080,
        height: 1920,
        fps: 30,
        tagline: 'Ч/б нуар + золотая карточка',
      },
      {
        id: 'TrinityBlogReel',
        width: 1080,
        height: 1920,
        fps: 30,
        tagline: 'Барочная гравюра',
      },
    ],
  }),
  my_assets: a => ({
    всего: 3,
    файлы: [
      { id: 1561, type: 'generated_image', public_url: S.scene },
      { id: 1560, type: 'voiceover', public_url: S.audio },
      { id: 1559, type: 'video', public_url: S.reelPip },
    ].slice(0, a?.limit || 3),
  }),
  my_balance: () => ({
    баланс_токенов: 98,
    прайс: {
      image_generate: 1,
      audio_generate: 6,
      video_generate: 20,
      reel_render: 1,
    },
    режим: 'MOCK',
  }),
  my_renders: a => ({
    всего: 2,
    рендеры: [
      {
        renderId: 'mock-1',
        завершён: true,
        url: S.reel,
        composition: 'SplitTalkingHead',
      },
      {
        renderId: 'mock-2',
        завершён: true,
        url: S.reelPip,
        composition: 'SplitTalkingHead',
      },
    ].slice(0, a?.limit || 2),
  }),
  // производство (в mock — мгновенно и «успешно»)
  image_generate: a => ({
    сделано: true,
    url: S.scene,
    провайдер: 'mock',
    prompt: a?.prompt,
  }),
  audio_generate: a => ({
    сделано: true,
    url: S.audio,
    провайдер: 'mock/minimax',
    text: a?.text,
  }),
  video_generate: a => ({
    сделано: true,
    url: S.reelPip,
    провайдер: 'mock/seedance',
    prompt: a?.prompt,
  }),
  reel_render: a => ({
    готово: true,
    url: S.reel,
    renderId: 'mock-' + Date.now(),
    compositionId: a?.compositionId,
  }),
  render_status: a => ({
    renderId: a?.renderId,
    статус: 'completed',
    url: S.reel,
  }),
  providers_status: () => ({
    работает: 4,
    всего: 4,
    провайдеры: [
      { провайдер: 'Replicate', ok: true },
      { провайдер: 'GLM', ok: true },
      { провайдер: 'FAL (mock)', ok: true },
      { провайдер: 'ElevenLabs (mock)', ok: true },
    ],
    режим: 'MOCK — всё «работает»',
  }),
  // скиллы
  skills_list: () => ({
    всего: 1,
    скиллы: [
      { id: 2, name: 'Тон рилсов', content: 'Коротко. Каждая фраза — факт.' },
    ],
  }),
  skills_create: a => ({ создано: true, id: 3, имя: a?.name || 'mock' }),
  skills_update: a => ({ обновлено: true, id: a?.id, имя: 'mock' }),
  skills_delete: a => ({ удалено: true, id: a?.id }),
  skills_publish: a => ({
    опубликовано: !!a?.public,
    id: a?.id,
    витрина: a?.public,
  }),
  skills_market: () => ({
    на_витрине: 2,
    скиллы: [
      { id: 10, name: 'Хук за 3 секунды', автор: 'demo' },
      { id: 11, name: 'CTA к звёздам', автор: 'demo' },
    ],
  }),
  skills_install: a => ({
    установлено: true,
    id: a?.id,
    имя: 'mock-market-skill',
  }),
  pricing: () => ({
    бесплатно: [
      { что: 'Лента, сценарии, SOUL, блог-рилы, img2img (Pollinations)' },
    ],
    // Even the mock reads the price list: the service charged 2/12/40/2 while
    // this taught 1/6/20/1 -- a sixth copy of one table, drifting in silence.
    платно: [
      { функция: 'image_generate', токенов: priceFor('image_generate') }, // cyrillic-ok: field names
      { функция: 'audio_generate', токенов: priceFor('audio_generate') }, // cyrillic-ok: field names
      { функция: 'video_generate', токенов: priceFor('video_generate') }, // cyrillic-ok: field names
      { функция: 'reel_render', токенов: priceFor('reel_render') }, // cyrillic-ok: field names
    ],
    режим: 'MOCK',
  }),
  provider_setup: (a: any) => ({
    провайдер: a?.provider || 'все',
    статус: 'работает (mock)',
    env: 'MOCK_KEY',
    как: 'В mock настройка не нужна — образец',
  }),
  // голос владельца
  soul_get: () => ({
    есть: true,
    обновлён: '2026-08-23 17:30:50+00',
    soul: '# Мой SOUL\nПрямой, измеримый, без обещаний.',
  }),
  soul_edit: a => ({ сохранено: true, длина: String(a?.soul || '').length }),
  // план
  plan_list: () => ({
    целей: 1,
    цели: [
      {
        id: 5,
        title: 'Оживить конвейер',
        items: [{ id: 6, title: 'Планировщик', status: 'в работе' }],
      },
    ],
  }),
  plan_goal_create: a => ({ создано: true, id: 5, цель: a?.title }),
  plan_goal_delete: a => ({ удалено: true, id: a?.id }),
  plan_item_add: a => ({ добавлено: true, id: 6, цель: a?.goal_id }),
  plan_item_update: a => ({
    изменено: true,
    id: a?.id,
    статус: a?.status || 'обновлено',
  }),
  plan_item_delete: a => ({ удалено: true, id: a?.id }),
}
const TOOL_NAMES = Object.keys(TOOL)

function body(req: any): Promise<string> {
  return new Promise(r => {
    let b = ''
    req.on('data', (c: any) => (b += c))
    req.on('end', () => r(b))
  })
}
function send(res: any, code: number, obj: any) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

const srv = createServer(async (req, res) => {
  const u = (req.url || '').split('?')[0]
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Api-Key, X-Agent-Key, X-Telegram-Init-Data, Authorization'
  )
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // — Генерация (таб с ИИ): всё «успешно», мгновенно, бесплатно —
  if (u === '/api/generate/image')
    return send(res, 200, {
      success: true,
      url: S.scene,
      provider: 'mock',
      id: 'mock-img',
    })
  if (u === '/api/generate/audio')
    return send(res, 200, {
      success: true,
      url: S.audio,
      provider: 'mock/minimax',
      id: 'mock-aud',
    })
  if (u === '/api/generate/video')
    return send(res, 200, {
      success: true,
      url: S.reelPip,
      provider: 'mock/seedance',
      id: 'mock-vid',
    })
  if (u === '/api/generate/lipsync')
    return send(res, 200, {
      success: true,
      url: S.reel,
      provider: 'mock',
      id: 'mock-lip',
    })

  // — Рендер шаблона —
  if (u === '/render/template' && req.method === 'POST') {
    const rid = 'mock-' + Date.now()
    return send(res, 202, {
      success: true,
      renderId: rid,
      statusUrl: `/render/${rid}`,
    })
  }
  if (u.startsWith('/render/') && req.method === 'GET') {
    return send(res, 200, {
      id: u.split('/').pop(),
      status: 'completed',
      progress: 100,
      outputUrl: S.reel,
    })
  }

  // — Лента (для мини-аппа) —
  if (u === '/api/feed' && req.method === 'GET') {
    return send(res, 200, {
      templates: TOOL.feed_list({ limit: 6 }).записи.map((r: any) => ({
        id: r.id,
        name: r.name,
        video_url: r.video_url,
        viewsCount: r.views_count,
        starsCount: r.stars_count,
      })),
    })
  }
  if (u === '/api/providers') return send(res, 200, TOOL.providers_status({}))

  // — MCP: карточка, список, вызов любого инструмента (эмуляция) —
  if (u === '/mcp' && req.method === 'GET')
    return send(res, 200, {
      сервис: 'Trinity S³AI — MOCK',
      протокол: 'MCP',
      инструментов: TOOL_NAMES.length,
      режим: 'эмуляция',
    })
  if (u === '/mcp' && req.method === 'POST') {
    let rpc: any = {}
    try {
      rpc = JSON.parse((await body(req)) || '{}')
    } catch {}
    const id = rpc.id ?? null
    if (rpc.method === 'initialize')
      return send(res, 200, {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'trinity-mock', version: '1.0.0' },
        },
      })
    if (rpc.method === 'tools/list')
      return send(res, 200, {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOL_NAMES.map(n => ({
            name: n,
            description: `[MOCK] ${n}`,
            inputSchema: { type: 'object', properties: {} },
          })),
        },
      })
    if (rpc.method === 'tools/call') {
      const name = rpc.params?.name
      const fn = TOOL[name]
      if (!fn)
        return send(res, 200, {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `нет инструмента «${name}». Есть: ${TOOL_NAMES.join(', ')}`,
          },
        })
      const значение = fn(rpc.params?.arguments || {})
      return send(res, 200, {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(значение, null, 1) }],
          structuredContent: значение,
        },
      })
    }
    return send(res, 200, {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `метод «${rpc.method}»` },
    })
  }

  // — A2A: карточка + message/send (эмуляция) —
  if (u === '/.well-known/agent-card.json' || u === '/.well-known/agent.json')
    return send(res, 200, {
      protocolVersion: '0.3.0',
      name: 'Trinity S³AI — MOCK',
      url: `http://localhost:${PORT}/a2a`,
      preferredTransport: 'JSONRPC',
      capabilities: { streaming: false },
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['application/json'],
      skills: TOOL_NAMES.map(n => ({
        id: n,
        name: n,
        description: `[MOCK] ${n}`,
        tags: ['mock'],
      })),
    })
  if (u === '/a2a' && req.method === 'POST') {
    let rpc: any = {}
    try {
      rpc = JSON.parse((await body(req)) || '{}')
    } catch {}
    const id = rpc.id ?? null
    if (rpc.method === 'message/send') {
      const skill = rpc.params?.message?.metadata?.skill
      const значение =
        skill && TOOL[skill]
          ? TOOL[skill](rpc.params?.message?.metadata?.args || {})
          : {
              ответ: '[MOCK] задача принята и «выполнена»',
              эхо: rpc.params?.message?.parts?.[0]?.text,
            }
      return send(res, 200, {
        jsonrpc: '2.0',
        id,
        result: {
          id: 'task-' + Date.now(),
          contextId: 'ctx',
          status: { state: 'completed' },
          artifacts: [
            {
              artifactId: 'a1',
              name: 'данные',
              parts: [{ kind: 'data', data: значение }],
            },
          ],
          kind: 'task',
        },
      })
    }
    return send(res, 200, {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `метод «${rpc.method}»` },
    })
  }

  // ── ВСЕ ПРОВАЙДЕРЫ сразу (эмуляция, без денег) ─────────────────────────────
  const ok = (extra: any) => send(res, 200, { success: true, ...extra })
  // Kling (видео)
  if (u === '/api/kling/video' || u === '/api/kling/i2v')
    return ok({ task_id: 'mock-kling-' + Date.now(), status: 'processing' })
  if (u.startsWith('/api/kling/task/'))
    return ok({
      status: 'succeeded',
      url: S.reelPip,
      task_id: u.split('/').pop(),
    })
  if (u === '/api/kling/tasks')
    return ok({
      tasks: [{ task_id: 'mock-kling', status: 'succeeded', url: S.reelPip }],
    })
  // HeyGen (аватар-видео)
  if (u === '/api/heygen/video')
    return ok({ video_id: 'mock-hg-' + Date.now(), status: 'processing' })
  if (u === '/api/heygen/avatars')
    return ok({
      avatars: [
        {
          avatar_id: 'trinity_persona',
          name: 'Trinity Persona',
          preview: S.scene,
        },
      ],
    })
  if (u === '/api/heygen/voices')
    return ok({ voices: [{ voice_id: 'ru_male', name: 'Русский мужской' }] })
  if (u.startsWith('/api/heygen/status/'))
    return ok({ status: 'completed', url: S.reel })
  // FAL (картинки/нейрофото)
  if (
    u === '/api/fal/neuro-photo' ||
    u === '/api/fal/flux-kontext' ||
    u === '/api/fal/nano-banana'
  )
    return ok({ url: S.scene, provider: 'mock/fal' })
  if (u.startsWith('/api/fal/status/')) return ok({ status: 'COMPLETED' })
  if (u.startsWith('/api/fal/result/')) return ok({ url: S.scene })
  // Replicate (операции)
  if (u === '/api/replicate/lipsync') return ok({ url: S.reel })
  if (u === '/api/replicate/morphing') return ok({ url: S.reelPip })
  if (u === '/api/replicate/faceswap') return ok({ url: S.scene })
  if (u === '/api/replicate/upscale') return ok({ url: S.scene })
  if (u === '/api/replicate/train-lora')
    return ok({ model: 'mock/user-lora', status: 'training' })
  if (u === '/api/replicate/predictions')
    return send(res, 200, {
      id: 'mock-pred',
      status: 'succeeded',
      output: [S.scene],
      urls: { get: `http://localhost:${PORT}/api/replicate/poll` },
    })
  if (u.startsWith('/api/replicate/poll'))
    return send(res, 200, { status: 'succeeded', output: [S.scene] })
  // OpenAI (расшифровка/зрение/промпт)
  if (u === '/api/openai/transcribe')
    return ok({ text: 'Это тестовая расшифровка аудио.' })
  if (u === '/api/openai/vision')
    return ok({
      description:
        'На фото — лысый бородатый мужчина в смокинге и тёмных очках.',
    })
  if (u === '/api/openai/improve-prompt')
    return ok({
      prompt:
        'cinematic baroque engraving, cream on matte black, golden ratio, dramatic light',
    })
  // Видео-редактирование (ffmpeg)
  if (u.startsWith('/api/video/'))
    return ok({ url: S.reel, operation: u.split('/').pop() })
  // B-roll
  if (u === '/api/broll/generate') return ok({ url: S.reelPip })
  if (u === '/api/broll/templates')
    return ok({
      templates: [
        { name: 'neon', category: 'abstract' },
        { name: 'clouds', category: 'nature' },
      ],
    })
  // Клон голоса
  if (u === '/api/voices/clone')
    return ok({ voice_id: 'mock-cloned-voice', name: 'Мой голос' })
  if (u === '/api/voices' && req.method === 'GET')
    return send(res, 200, {
      voices: [
        { voice_id: 'ru_male', name: 'Русский мужской', category: 'premade' },
      ],
    })
  if (u.startsWith('/api/voices/') && req.method === 'DELETE')
    return ok({ deleted: true })
  // Hedra (липсинк-статус)
  if (u.startsWith('/api/hedra/status/'))
    return ok({ status: 'completed', url: S.reel })
  if (u === '/api/hedra/jobs')
    return ok({ jobs: [{ job_id: 'mock', status: 'completed', url: S.reel }] })
  // BFL (FLUX статус)
  if (u.startsWith('/api/bfl/result/'))
    return send(res, 200, { status: 'Ready', result: { sample: S.scene } })

  if (u === '/health' || u === '/healthz')
    return send(res, 200, { ok: true, mock: true })
  send(res, 404, {
    error: 'mock: маршрут не эмулируется',
    routes: [
      '/api/generate/*',
      '/render/template',
      '/mcp',
      '/a2a',
      '/api/feed',
      '/health',
    ],
    функций: TOOL_NAMES.length,
  })
})
srv.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.log(
      `🎭 MOCK уже запущен на :${PORT} — открой http://localhost:${PORT}. ` +
        `Другой порт: MOCK_PORT=3337 make mock`
    )
    process.exit(0)
  }
  throw e
})
srv.listen(PORT, () =>
  console.log(
    `🎭 MOCK-сервер (эмуляция ${TOOL_NAMES.length} функций + генерация) на http://localhost:${PORT}`
  )
)
