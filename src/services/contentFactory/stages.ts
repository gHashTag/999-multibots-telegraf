import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '@/utils/logger'
import { telegramApiFor } from '@/services/telegramApi'
import { runModel, firstUrl } from './replicate'
import { mirror, putFile } from './storage'
import { Artifact, Caption, Cut, FactoryContext, StageError } from './types'

const exec = promisify(execFile)

/**
 * Стадии завода. Каждая берёт вход, отдаёт артефакт и НИЧЕГО не знает про
 * манифест и порядок — этим занимается pipeline.ts. Поэтому любую стадию можно
 * прогнать отдельно и повторить, не трогая соседние.
 */

/** Клон голоса владельца. Один и тот же во всех канонах. */
const VOICE_ID = process.env.FACTORY_VOICE_ID || 'R8_5GW2UI4A'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

async function durationSec(file: string): Promise<number> {
  const { stdout } = await exec(FFPROBE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  const d = parseFloat(stdout.trim())
  if (!isFinite(d) || d <= 0)
    throw new Error(`ffprobe не смог измерить ${file}`)
  return d
}

// ────────────────────────────── 1. Голос ──────────────────────────────

export async function stageVoice(
  ctx: FactoryContext
): Promise<{ audio: Artifact; durationSec: number }> {
  const out = await runModel(
    'minimax/speech-02-hd',
    {
      text: ctx.order.script,
      voice_id: VOICE_ID,
      emotion: ctx.canon.voiceEmotion,
      language_boost: ctx.order.language === 'ru' ? 'Russian' : 'English',
      speed: 1.0,
    },
    { stage: 'voice' }
  )

  // Зеркалим НЕМЕДЛЕННО: ссылка Replicate живёт около часа, дальше приходит
  // пустой файл, а рендер тянет медиа по ссылке уже после всех стадий.
  const mp3 = path.join(ctx.workDir, 'voice.mp3')
  await mirror(firstUrl(out), mp3, `${ctx.runId}-voice.mp3`)

  // wav нужен и omni-human, и whisperx: с mp3 обе модели иногда молчат.
  const wav = path.join(ctx.workDir, 'voice.wav')
  await exec(FFMPEG, ['-y', '-i', mp3, '-ar', '44100', '-ac', '1', wav])
  const audio = await putFile(wav, `${ctx.runId}-voice.wav`)

  const dur = await durationSec(wav)
  ctx.log(`голос готов, ${dur.toFixed(1)} с`)
  return { audio, durationSec: dur }
}

// ────────────────────────────── 2. Планы ──────────────────────────────

export async function stageScenes(
  ctx: FactoryContext,
  shots: string[]
): Promise<Record<string, Artifact>> {
  const faceRef = `${ctx.publicBase}/${ctx.canon.faceRef}`
  const result: Record<string, Artifact> = {}

  // Последовательно, а не разом: flux дешёвый, но при пачке параллельных
  // запросов отдаёт больше отказов, чем экономит времени.
  for (const shot of shots) {
    const prompt = ctx.canon.shots[shot]
    if (!prompt) {
      throw new StageError(
        'scenes',
        `у канона ${ctx.canon.id} нет плана «${shot}»`
      )
    }
    const out = await runModel(
      'black-forest-labs/flux-kontext-pro',
      {
        prompt,
        input_image: faceRef,
        aspect_ratio: '9:16',
        output_format: 'jpg',
      },
      { stage: 'scenes' }
    )
    const local = path.join(ctx.workDir, `shot-${shot}.jpg`)
    result[shot] = await mirror(
      firstUrl(out),
      local,
      `${ctx.runId}-shot-${shot}.jpg`
    )
    ctx.log(`план «${shot}» готов`)
  }
  return result
}

// ───────────────────────────── 3. Липсинк ─────────────────────────────

/**
 * Липсинк каждого плана на ОДНО И ТО ЖЕ аудио. Это ключевое свойство: планы
 * оказываются покадрово синхронны, поэтому монтаж можно резать в любой точке
 * и губы не разъедутся. Если у планов будет разное аудио, склейка развалится.
 */
export async function stageLipsync(
  ctx: FactoryContext,
  scenes: Record<string, Artifact>,
  audio: Artifact
): Promise<Record<string, Artifact>> {
  const result: Record<string, Artifact> = {}

  for (const [shot, scene] of Object.entries(scenes)) {
    const out = await runModel(
      'bytedance/omni-human',
      { image: scene.url, audio: audio.url },
      // Три попытки: провайдер регулярно отдаёт транзиентные «Failed to upload»
      // и InvalidTimestamp, и упавшие прогоны не тарифицируются.
      { stage: 'lipsync', attempts: 3, timeoutMs: 25 * 60 * 1000 }
    )
    const local = path.join(ctx.workDir, `lip-${shot}.mp4`)
    result[shot] = await mirror(
      firstUrl(out),
      local,
      `${ctx.runId}-lip-${shot}.mp4`
    )
    ctx.log(`липсинк «${shot}» готов`)
  }
  return result
}

// ───────────────────────────── 4. Титры ─────────────────────────────

// Версия закреплена: whisperx на Replicate — community-модель, зовётся по
// хэшу версии, а не по имени. Меняется только осознанно.
const WHISPERX_VERSION =
  process.env.WHISPERX_VERSION ||
  '655845d6190ef70573c669245f245892cd039df4b880a1e3a65852c09252f5cc'

export async function stageCaptions(
  ctx: FactoryContext,
  audio: Artifact
): Promise<{ words: Caption[] }> {
  const out = (await runModel(
    WHISPERX_VERSION,
    {
      audio_file: audio.url,
      language: ctx.order.language,
      // Без align_output модель отдаёт только границы фраз — по ним нельзя
      // ни поставить титры пословно, ни резать монтаж по паузам.
      align_output: true,
    },
    { stage: 'captions' }
  )) as {
    segments?: { words?: { word: string; start?: number; end?: number }[] }[]
  }

  const words: Caption[] = []
  for (const seg of out.segments || []) {
    for (const w of seg.words || []) {
      if (typeof w.start !== 'number' || typeof w.end !== 'number') continue
      const text = w.word.trim()
      if (text) {
        words.push({
          text,
          startMs: Math.round(w.start * 1000),
          endMs: Math.round(w.end * 1000),
        })
      }
    }
  }
  if (!words.length) {
    throw new StageError(
      'captions',
      'whisperx не вернул ни одного слова с таймингом'
    )
  }
  ctx.log(`титры: ${words.length} слов`)
  return { words }
}

// ──────────────────────── 5. Монтаж планов ────────────────────────

/**
 * Границы фраз из пословных таймингов: рез ставится там, где человек сделал
 * паузу, а не по метроному. Пауза длиннее порога = конец фразы.
 */
export function phraseBoundaries(words: Caption[], minGapMs = 300): number[] {
  const cuts: number[] = []
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs
    const endsSentence = /[.!?]$/.test(words[i - 1].text)
    if (gap >= minGapMs || endsSentence) {
      // Рез посередине паузы — так ни одно слово не подрезается.
      cuts.push((words[i - 1].endMs + words[i].startMs) / 2000)
    }
  }
  return cuts
}

/** Раскладывает планы по фразам: соседние отрезки всегда разные планы. */
export function planCuts(
  shots: string[],
  boundaries: number[],
  totalSec: number,
  minSegmentSec = 1.6
): Cut[] {
  const marks = [0, ...boundaries, totalSec]
  const cuts: Cut[] = []
  let start = 0
  let shotIndex = 0

  for (let i = 1; i < marks.length; i++) {
    const end = marks[i]
    // Слишком короткий кусок не режем: мелькание планов читается как брак.
    if (end - start < minSegmentSec && i < marks.length - 1) continue
    cuts.push({
      shot: shots[shotIndex % shots.length],
      startSec: start,
      endSec: end,
    })
    shotIndex++
    start = end
  }
  if (!cuts.length) {
    cuts.push({ shot: shots[0], startSec: 0, endSec: totalSec })
  }
  return cuts
}

export async function stageCompose(
  ctx: FactoryContext,
  lipsync: Record<string, Artifact>,
  audio: Artifact,
  cuts: Cut[]
): Promise<{ track: Artifact; cuts: Cut[] }> {
  const shots = Object.keys(lipsync)
  const inputs: string[] = []
  for (const shot of shots) {
    const local = lipsync[shot].localPath
    if (!local)
      throw new StageError('compose', `нет локального файла плана ${shot}`)
    inputs.push('-i', local)
  }
  const audioLocal = audio.localPath
  if (!audioLocal)
    throw new StageError('compose', 'нет локального файла озвучки')
  inputs.push('-i', audioLocal)
  const audioIndex = shots.length

  const parts: string[] = []
  const labels: string[] = []
  cuts.forEach((cut, i) => {
    const idx = shots.indexOf(cut.shot)
    if (idx < 0)
      throw new StageError('compose', `плана ${cut.shot} нет среди липсинков`)
    // Приводим все планы к одной геометрии и fps: исходники omni-human
    // отличаются по размеру, а несовпадение fps даёт чёрный кадр на стыке.
    parts.push(
      `[${idx}:v]trim=start=${cut.startSec}:end=${cut.endSec},setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[v${i}];`
    )
    labels.push(`[v${i}]`)
  })
  const filter =
    parts.join('') + labels.join('') + `concat=n=${cuts.length}:v=1:a=0[vout]`

  const out = path.join(ctx.workDir, 'track.mp4')
  await exec(
    FFMPEG,
    [
      '-y',
      ...inputs,
      '-filter_complex',
      filter,
      '-map',
      '[vout]',
      '-map',
      `${audioIndex}:a`,
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      out,
    ],
    { maxBuffer: 32 * 1024 * 1024 }
  )

  const track = await putFile(out, `${ctx.runId}-track.mp4`)
  ctx.log(`монтаж готов: ${cuts.length} отрезков`)
  return { track, cuts }
}

// ───────────────────────────── 6. Рендер ─────────────────────────────

export interface RenderInput {
  props: Record<string, unknown>
  /** Каталог render-приложения; по умолчанию берётся из окружения. */
  renderDir?: string
}

export async function stageRender(
  ctx: FactoryContext,
  input: RenderInput
): Promise<{ video: Artifact }> {
  const renderDir =
    input.renderDir ||
    process.env.FACTORY_RENDER_DIR ||
    path.resolve(process.cwd(), 'apps/vibee-editor/render')

  const propsPath = path.join(ctx.workDir, 'props.json')
  await fs.writeFile(propsPath, JSON.stringify(input.props, null, 2), 'utf-8')

  const outPath = path.join(ctx.workDir, 'reel.mp4')
  ctx.log(`рендер ${ctx.canon.composition}…`)

  await exec(
    'npx',
    [
      'remotion',
      'render',
      ctx.canon.entry,
      ctx.canon.composition,
      outPath,
      `--props=${propsPath}`,
      '--concurrency=8',
    ],
    { cwd: renderDir, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 }
  )

  const video = await putFile(outPath, `${ctx.runId}-reel.mp4`)
  ctx.log('рендер готов')
  return { video }
}

// ───────────────────────────── 7. Отдача ─────────────────────────────

export async function stageDeliver(
  video: Artifact,
  chatId: string,
  caption: string
): Promise<{ chatId: string; messageId: number }> {
  const token = process.env.BOT_TOKEN_1
  if (!token)
    throw new StageError('deliver', 'BOT_TOKEN_1 не задан, отправлять нечем')
  if (!video.localPath)
    throw new StageError('deliver', 'нет локального файла рилса')

  const body = new FormData()
  body.append('chat_id', chatId)
  body.append('caption', caption)
  body.append('supports_streaming', 'true')
  const bytes = await fs.readFile(video.localPath)
  body.append(
    'video',
    new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }),
    'reel.mp4'
  )

  const res = await fetch(`${telegramApiFor(token)}/sendVideo`, {
    method: 'POST',
    body,
  })
  const data = (await res.json()) as {
    ok: boolean
    result?: { message_id: number }
    description?: string
  }
  if (!data.ok || !data.result) {
    throw new StageError(
      'deliver',
      `Telegram отказал: ${data.description || 'без причины'}`
    )
  }

  logger.info('[contentFactory] рилс отправлен', {
    chatId,
    messageId: data.result.message_id,
  })
  return { chatId, messageId: data.result.message_id }
}
