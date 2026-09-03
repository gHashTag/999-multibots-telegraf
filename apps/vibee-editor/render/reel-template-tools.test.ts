import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CINEMATIC_SIX_SCENE_V1,
  createReelTemplateTools,
} from './src/agent/reel-template-tools'

const prices = {
  image_generate: 1,
  audio_generate: 6,
  video_generate: 20,
  reel_render: 1,
}

const here = path.dirname(fileURLToPath(import.meta.url))

function fakeContext() {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  let nextId = 40
  return {
    calls,
    ctx: {
      telegramId: 'owner-42',
      pool: {
        async query(sql: string, params?: unknown[]) {
          calls.push({ sql, params })
          if (sql.includes('FROM user_reel_templates')) {
            return {
              rows: [
                {
                  id: 7,
                  name: 'Киноплёнка',
                  source_video_url: 'https://media.invalid/reference.mp4',
                  recipe: JSON.stringify(CINEMATIC_SIX_SCENE_V1),
                  updated_at: '2026-09-01T00:00:00.000Z',
                },
              ],
            }
          }
          if (sql.includes('RETURNING id')) {
            nextId += 1
            return {
              rows: [{ id: nextId, updated_at: '2026-09-01T00:00:00.000Z' }],
            }
          }
          return { rows: [] }
        },
      },
    },
  }
}

const sixScenes = CINEMATIC_SIX_SCENE_V1.sceneBeats.map((beat, index) => ({
  beat,
  prompt: `Сцена ${index + 1}: визуальное продолжение темы`,
}))

describe('private cinematic reel template tools', () => {
  it('defines a reusable six-scene recipe instead of freezing one mp4', () => {
    expect(CINEMATIC_SIX_SCENE_V1.compositionId).toBe('SplitTalkingHead')
    expect(CINEMATIC_SIX_SCENE_V1.sceneBeats).toHaveLength(6)
    expect(CINEMATIC_SIX_SCENE_V1.style).toMatchObject({
      filmGrainOpacity: 0.13,
      filmFlickerStrength: 0.016,
      vignetteStrength: 0.24,
      colorCorrection: 0.97,
    })
    expect(CINEMATIC_SIX_SCENE_V1.captions.source).toBe(
      'final-audio-word-timestamps'
    )
    expect(CINEMATIC_SIX_SCENE_V1.presenter).toMatchObject({
      mode: 'owner-avatar-throughout-story',
      animatePerSceneWindow: true,
      keepVisibleAsPictureInPictureOverBRoll: true,
    })
    expect(CINEMATIC_SIX_SCENE_V1.clubWelcomeStory).toHaveLength(6)
    expect(
      CINEMATIC_SIX_SCENE_V1.clubWelcomeStory.map(scene => scene.function)
    ).toEqual([
      'welcome',
      'verified-profile',
      'content-plan',
      'creative-production',
      'agent-connections',
      'owner-control',
    ])
    expect(CINEMATIC_SIX_SCENE_V1.clubWelcomeVoiceDraft).toContain(
      'Расходы и публикации — только с вашего подтверждения.'
    )
    expect(CINEMATIC_SIX_SCENE_V1.qualityGate).toMatchObject({
      maxAudioVisualOnsetErrorFrames: 2,
      interpolateProviderFrames: true,
      videoCrf: 18,
      quoteProviderCostBeforeExecution: true,
    })
  })

  it('saves the canonical recipe under the verified owner only', async () => {
    const { calls, ctx } = fakeContext()
    const tool = createReelTemplateTools(prices).find(
      item => item.name === 'reel_template_save'
    )!

    const result = (await tool.handler(
      {
        name: 'Киноплёнка',
        source_video_url: 'https://media.invalid/reference.mp4',
      },
      ctx
    )) as Record<string, unknown>

    const write = calls.find(call =>
      call.sql.includes('INSERT INTO user_reel_templates')
    )!
    expect(write.params?.[0]).toBe('owner-42')
    expect(tool.parameters).not.toHaveProperty('properties.telegram_id')
    expect(result).toMatchObject({
      сохранено: true,
      приватно: true,
      compositionId: 'SplitTalkingHead',
    })
    expect(calls.map(call => call.sql).join('\n')).not.toMatch(/CREATE TABLE/i)
  })

  it('lists templates as a truly read-only MCP operation', async () => {
    const { calls, ctx } = fakeContext()
    const tool = createReelTemplateTools(prices).find(
      item => item.name === 'reel_templates_list'
    )!

    const result = (await tool.handler({}, ctx)) as Record<string, any>

    expect(result['всего']).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].sql.trim()).toMatch(/^SELECT/)
    expect(tool.annotations?.readOnlyHint).toBe(true)
  })

  it('prepares a priced draft without generation, publication or wallet writes', async () => {
    const { calls, ctx } = fakeContext()
    const tool = createReelTemplateTools(prices).find(
      item => item.name === 'reel_from_template_prepare'
    )!

    const result = (await tool.handler(
      {
        template_id: 7,
        topic: 'Почему агентная соцсеть заменяет ручной монтаж',
        goal: 'Показать продукт разработчикам',
        voice_text: 'Шесть сцен складываются в одну историю.',
        scenes: sixScenes,
        new_image_count: 6,
        animate_scene_count: 6,
      },
      ctx
    )) as Record<string, any>

    expect(result).toMatchObject({
      подготовлено: true,
      status: 'draft',
      requires_owner_confirmation: true,
      paid_generation_started: false,
      publication_started: false,
      estimated_app_tokens: 133,
    })
    const sql = calls.map(call => call.sql).join('\n')
    expect(sql).toContain('INSERT INTO agent_reel_drafts')
    expect(sql).not.toMatch(/UPDATE\s+user_tokens/i)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public_templates/i)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+assets/i)
  })

  it('rejects an incomplete storyboard before touching the database', async () => {
    const { calls, ctx } = fakeContext()
    const tool = createReelTemplateTools(prices).find(
      item => item.name === 'reel_from_template_prepare'
    )!

    const result = (await tool.handler(
      {
        template_id: 7,
        topic: 'Тема',
        voice_text: 'Текст',
        scenes: sixScenes.slice(0, 5),
      },
      ctx
    )) as Record<string, unknown>

    expect(result).toMatchObject({ подготовлено: false })
    expect(calls).toHaveLength(0)
  })

  it('keeps owner isolation in the versioned migration, not runtime DDL', () => {
    const migration = fs.readFileSync(
      path.join(
        here,
        '../../../sql/migrations/20260901_create_private_reel_templates.sql'
      ),
      'utf8'
    )
    expect(migration).toContain('UNIQUE (id, telegram_id)')
    expect(migration).toContain('FOREIGN KEY (template_id, telegram_id)')
    expect(migration).toContain("CHECK (status = 'draft')")
  })

  it('teaches the buttonless chat to prepare first and spend only after words of approval', () => {
    const source = fs.readFileSync(path.join(here, 'src/agent/chat.ts'), 'utf8')
    expect(source).toContain('reel_templates_list')
    expect(source).toContain('reel_from_template_prepare')
    expect(source).toContain('без кнопок')
    expect(source).toContain('явного ответа «делай рилс <draft_id>»')
    expect(source).toContain('Публикация требует отдельного подтверждения')
  })
})
