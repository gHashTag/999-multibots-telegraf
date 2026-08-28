import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { logger } from '@/utils/logger'
import { getCanon } from './canons'
import { putJson, fetchJson } from './storage'
import {
  stageVoice,
  stageScenes,
  stageLipsync,
  stageCaptions,
  stageCompose,
  stageRender,
  stageDeliver,
  phraseBoundaries,
  planCuts,
} from './stages'
import {
  FactoryContext,
  Manifest,
  ReelOrder,
  StageName,
  Caption,
} from './types'

/**
 * Конвейер завода.
 *
 * Главное свойство — ВОЗОБНОВЛЯЕМОСТЬ. Один прогон стоит реальных денег
 * (голос, четыре плана img2img, четыре липсинка, транскрипция), и падение на
 * седьмой стадии не должно сжигать первые шесть. Поэтому после каждой стадии
 * манифест кладётся на полку, а повторный запуск с тем же входом поднимает
 * готовые артефакты и доделывает только остаток.
 *
 * runId выводится из входа (канон + текст + язык), а не из времени: тот же
 * заказ обязан попасть в тот же прогон, иначе возобновление бессмысленно.
 */

export interface RunOptions {
  /** Начать заново, игнорируя сохранённые стадии. */
  fresh?: boolean
  /** Остановиться после указанной стадии — удобно смотреть промежуточный результат. */
  until?: StageName
  /** Подпись к отправляемому файлу. */
  caption?: string
  onProgress?: (msg: string) => void
}

export function runIdFor(order: ReelOrder): string {
  const hash = createHash('sha256')
    .update(`${order.canon}|${order.language}|${order.script.trim()}`)
    .digest('hex')
    .slice(0, 12)
  return `factory-${order.canon}-${hash}`
}

const STAGE_ORDER: StageName[] = [
  'voice',
  'scenes',
  'lipsync',
  'captions',
  'compose',
  'render',
  'deliver',
]

const reachedLimit = (
  until: StageName | undefined,
  current: StageName
): boolean =>
  Boolean(until) && STAGE_ORDER.indexOf(current) > STAGE_ORDER.indexOf(until!)

/** Пропсы шаблона из артефактов прогона. Здесь и только здесь живёт канон→пропсы. */
function buildProps(
  ctx: FactoryContext,
  trackUrl: string,
  words: Caption[],
  musicUrl: string | null
): Record<string, unknown> {
  const captions = words.map(w => ({
    text: w.text.toUpperCase(),
    startMs: w.startMs,
    endMs: w.endMs,
  }))

  if (ctx.canon.id === 'noir') {
    return {
      lipSyncVideo: trackUrl,
      captions,
      cutaways: [],
      music: musicUrl || '',
      musicVolume: ctx.canon.musicVolume,
      brand: {
        masthead: 'Trinity S³AI',
        eyebrow: 'Закрытый клуб · набор волнами',
        name: 'Золотая Литейная',
        cta: 't27.ai/foundry',
        sub: 'оплата в боте · @t27ai_bot',
        ...(ctx.order.brand || {}),
      },
    }
  }

  if (ctx.canon.id === 'blog') {
    return {
      lang: ctx.order.language,
      avatarVideo: trackUrl,
      captions: words.map(w => ({
        text: w.text,
        startMs: w.startMs,
        endMs: w.endMs,
      })),
      music: musicUrl || '',
      musicVolume: ctx.canon.musicVolume,
      ...(ctx.order.brand || {}),
    }
  }

  // promo (SplitTalkingHead): ритм полного экрана и сплитов задан каноном
  // промо-контура — полный 60 кадров, дальше пары сплит 120 + полный 45.
  return {
    lipSyncVideo: trackUrl,
    captions,
    showCaptions: true,
    backgroundMusic: musicUrl || '',
    musicVolume: ctx.canon.musicVolume,
    splitRatio: 0.5,
    ...(ctx.order.brand || {}),
  }
}

export async function runFactory(
  order: ReelOrder,
  opts: RunOptions = {}
): Promise<Manifest> {
  const canon = getCanon(order.canon)
  const runId = runIdFor(order)
  const workDir = path.join(os.tmpdir(), 'content-factory', runId)
  await fs.mkdir(workDir, { recursive: true })

  const publicBase = (
    process.env.FACTORY_PUBLIC_BASE ||
    process.env.RENDER_SERVER_URL ||
    ''
  ).replace(/\/+$/, '')

  const manifestName = `${runId}-manifest.json`
  const manifestUrl = `${publicBase}/s3/manifests/${manifestName}`

  let manifest: Manifest | null = opts.fresh
    ? null
    : await fetchJson<Manifest>(manifestUrl)

  if (!manifest) {
    manifest = {
      runId,
      inputHash: runId.split('-').pop() as string,
      order,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages: {},
      failures: [],
    }
  }

  const log = (msg: string, extra?: Record<string, unknown>) => {
    logger.info(`[factory:${runId}] ${msg}`, extra)
    opts.onProgress?.(msg)
  }

  const ctx: FactoryContext = {
    runId,
    canon,
    order,
    workDir,
    storagePrefix: runId,
    publicBase,
    log,
  }

  const save = async () => {
    manifest!.updatedAt = new Date().toISOString()
    await putJson(manifest, manifestName, path.join(workDir, 'manifest.json'))
  }

  const shots = order.shotPlan?.length
    ? order.shotPlan
    : Object.keys(canon.shots)

  try {
    // 1. Голос
    if (!manifest.stages.voice) {
      manifest.stages.voice = await stageVoice(ctx)
      await save()
    } else {
      log('голос взят из прошлого прогона')
    }
    if (reachedLimit(opts.until, 'scenes')) return manifest

    // 2. Планы
    if (!manifest.stages.scenes) {
      manifest.stages.scenes = await stageScenes(ctx, shots)
      await save()
    } else {
      log('планы взяты из прошлого прогона')
    }
    if (reachedLimit(opts.until, 'lipsync')) return manifest

    // 3. Липсинк — самая долгая и дорогая стадия
    if (!manifest.stages.lipsync) {
      manifest.stages.lipsync = await stageLipsync(
        ctx,
        manifest.stages.scenes!,
        manifest.stages.voice!.audio
      )
      await save()
    } else {
      log('липсинк взят из прошлого прогона')
    }
    if (reachedLimit(opts.until, 'captions')) return manifest

    // 4. Титры
    if (!manifest.stages.captions) {
      manifest.stages.captions = await stageCaptions(
        ctx,
        manifest.stages.voice!.audio
      )
      await save()
    }
    if (reachedLimit(opts.until, 'compose')) return manifest

    // 5. Монтаж по границам фраз
    if (!manifest.stages.compose) {
      const words = manifest.stages.captions!.words
      const cuts = planCuts(
        shots,
        phraseBoundaries(words),
        manifest.stages.voice!.durationSec
      )
      manifest.stages.compose = await stageCompose(
        ctx,
        manifest.stages.lipsync!,
        manifest.stages.voice!.audio,
        cuts
      )
      await save()
    }
    if (reachedLimit(opts.until, 'render')) return manifest

    // 6. Рендер
    if (!manifest.stages.render) {
      const music = canon.music ? `${publicBase}/${canon.music}` : null
      const props = buildProps(
        ctx,
        manifest.stages.compose!.track.url,
        manifest.stages.captions!.words,
        music
      )
      manifest.stages.render = await stageRender(ctx, { props })
      await save()
    }
    if (reachedLimit(opts.until, 'deliver')) return manifest

    // 7. Отдача
    if (order.deliverTo && !manifest.stages.deliver) {
      manifest.stages.deliver = await stageDeliver(
        manifest.stages.render!.video,
        order.deliverTo,
        opts.caption || `Рилс «${canon.id}» готов`
      )
      await save()
    }

    log('прогон завершён')
    return manifest
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stage =
      error && typeof error === 'object' && 'stage' in error
        ? ((error as { stage: StageName }).stage as StageName)
        : 'render'
    manifest.failures.push({ stage, message, at: new Date().toISOString() })
    await save().catch(() => undefined)
    // Пробрасываем: молчаливый отказ здесь означал бы «рилс готов», а его нет.
    // Всё уже сделанное лежит в манифесте, повторный запуск продолжит с места.
    throw error
  }
}
