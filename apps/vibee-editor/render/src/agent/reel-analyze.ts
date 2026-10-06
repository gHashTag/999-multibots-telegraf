/**
 * READ SOMEBODY ELSE'S REEL, GET OUR SPEC BACK.
 *
 * Owner, 2026-10-02: a person shows a reel they like; we take it apart and
 * hand back the same reel made from a .t27 spec, with THEIR face and voice.
 * This tool is the taking-apart half. Everything it uses is ours and free:
 * ffmpeg for the cuts, whisper for the words, the vision pod (qwen3-vl) for
 * what each shot shows. Nothing leaves the Railway network.
 *
 * What comes back is the shape of gHashTag/t27 specs/automation/split-reel.t27:
 * the measured cuts as segments, which of them are split and which full, the
 * rhythm compared with the spec's, and props for SplitTalkingHead cut on the
 * SPEC's rhythm (spec/split-reel.gen.ts), waiting for a lipsync of the
 * person's own face. The reference reel is read, never republished.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AgentTool } from './tools'
import { askVision, visionConfig } from './media-vision'
import { whisperBytes, whisperConfig } from './media-library'
import { resolveFinalUrl } from './web-guard'
import {
  downloadBoundedMediaToFile,
  type AddressLookup,
} from '../lib/remoteMediaDuration'
import * as SPEC from '../spec/split-reel.gen'
import { splitSegments } from '../split-reel-plan'

const execFileAsync = promisify(execFile)

export type Exec = (
  bin: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>

let exec: Exec = async (bin, args) => {
  const r = await execFileAsync(bin, args, {
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return { stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') }
}

/** ffmpeg and ffprobe for the other reel tools, through the same test seam. */
export const reelExec: Exec = (bin, args) => exec(bin, args)

export function setReelExecForTests(next: Exec): Exec {
  const prev = exec
  exec = next
  return prev
}

/**
 * Input options for every ffmpeg and ffprobe run on a downloaded reel, placed
 * BEFORE the input. The file came from a url the model chose, and ffmpeg
 * decides what a file is by its bytes, not its name: a "reel.mp4" that is an
 * HLS playlist (or a concat list) makes ffmpeg open the urls inside it itself
 * -- the metadata endpoint, a sibling service, file:///etc/passwd -- past
 * every check web-guard made. So ffmpeg may open only local files, and may
 * read only the containers a phone reel comes in: mov/mp4 and matroska/webm.
 */
export const REEL_INPUT_ARGS: readonly string[] = [
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  'mov,matroska',
]

/** A cut is a frame whose scene score is above this. */
export const SCENE_THRESHOLD = 0.3
/** Cuts closer than this to the previous one are the same cut. */
const MIN_SHOT_S = 0.25

/** Cut times from ffmpeg's `select=gt(scene,..),showinfo` stderr. */
export function parseSceneCuts(stderr: string): number[] {
  const out: number[] = []
  for (const m of String(stderr).matchAll(/pts_time:\s*([0-9.]+)/g)) {
    const t = Number(m[1])
    if (!Number.isFinite(t)) continue
    if (out.length && t - out[out.length - 1] < MIN_SHOT_S) continue
    out.push(Math.round(t * 100) / 100)
  }
  return out
}

export interface Shot {
  startS: number
  endS: number
  startFrame: number
  durationFrames: number
}

/** The shots between the cuts, in frames at the reel's fps. */
export function shotsFromCuts(
  cuts: readonly number[],
  durationS: number,
  fps: number
): Shot[] {
  const edges = [0, ...cuts.filter(c => c > 0 && c < durationS), durationS]
  const shots: Shot[] = []
  for (let i = 0; i + 1 < edges.length; i++) {
    const startFrame = Math.round(edges[i] * fps)
    const endFrame = Math.round(edges[i + 1] * fps)
    if (endFrame <= startFrame) continue
    shots.push({
      startS: edges[i],
      endS: edges[i + 1],
      startFrame,
      durationFrames: endFrame - startFrame,
    })
  }
  return shots
}

export const SHOT_PROMPT =
  'Look at this frame of a vertical reel. First word of your answer: SPLIT if the frame is ' +
  'two different pictures stacked (one on top, one below), FULL if it is one picture. Then ' +
  'one short sentence: what the TOP picture shows (for SPLIT) or the whole frame (for FULL).'

/** The vision answer as a layout and a description. */
export function parseShotVerdict(text: string | null): {
  type: 'split' | 'fullscreen' | 'unknown'
  shows: string
} {
  const t = String(text ?? '').trim()
  const first = /^\W*(split|full)/i.exec(t)?.[1]?.toLowerCase()
  const shows = t.replace(/^\W*(split|full)\W*/i, '').trim()
  if (first === 'split') return { type: 'split', shows }
  if (first === 'full') return { type: 'fullscreen', shows }
  return { type: 'unknown', shows: t }
}

/** How far the measured rhythm is from the spec's, shot by shot. */
export function rhythmAgainstSpec(
  shots: readonly { type: string; durationFrames: number }[]
): { matches: boolean; expected: number[]; measured: number[] } {
  const total = shots.reduce((s, x) => s + x.durationFrames, 0)
  const expected = splitSegments(total).map(s => s.durationFrames)
  const measured = shots.map(s => s.durationFrames)
  const close =
    expected.length === measured.length &&
    // the last cut is decided by where the voice ends, so it is not compared
    expected
      .slice(0, -1)
      .every((e, i) => Math.abs(e - measured[i]) <= Math.round(SPEC.FPS / 5))
  return { matches: close, expected, measured }
}

async function probe(
  file: string
): Promise<{ durationS: number; fps: number }> {
  const r = await exec('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=r_frame_rate:format=duration',
    '-of',
    'json',
    ...REEL_INPUT_ARGS,
    file,
  ])
  const j = JSON.parse(r.stdout || '{}')
  const [n, d] = String(j?.streams?.[0]?.r_frame_rate ?? '30/1').split('/')
  const fps = Number(n) / (Number(d) || 1) || SPEC.FPS
  return { durationS: Number(j?.format?.duration) || 0, fps }
}

/**
 * A reference reel is seconds of phone video; anything bigger is not one.
 * Enforced twice by downloadBoundedMediaToFile: a declared Content-Length over
 * it is refused before the body is read, and the body itself is counted while
 * it streams to disk, so a lying header or an endless body stops here too.
 */
export const REEL_MAX_BYTES = 100 * 1024 * 1024

export async function analyzeReel(
  url: string,
  opts: {
    /** Test seams; production resolves and pins every hop itself. */
    fetchImpl?: typeof fetch
    lookupImpl?: AddressLookup
    /** Tests only: a smaller cap so an endless body is cheap to send. */
    maxBytes?: number
  } = {}
): Promise<Record<string, unknown>> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-analyze-'))
  try {
    // The url is the model's choice: the one guarded door, every redirect hop
    // checked, the address pinned, the body capped. A refusal says only that
    // it was refused -- a status code would tell a caller which internal
    // address is alive.
    const target = await resolveFinalUrl(url, {
      fetchImpl: opts.fetchImpl,
      lookupImpl: opts.lookupImpl,
    })
    if (!target.ok) return { ok: false, why: target.reason }
    const file = path.join(dir, 'reel.mp4')
    try {
      await downloadBoundedMediaToFile(target.url, file, {
        fetchImpl: opts.fetchImpl,
        lookupImpl: opts.lookupImpl,
        maxBytes: opts.maxBytes ?? REEL_MAX_BYTES,
        timeoutMs: 60_000,
      })
    } catch {
      return { ok: false, why: 'could not download the video' }
    }
    const { durationS, fps } = await probe(file)
    if (!durationS) return { ok: false, why: 'not a video' }

    const scene = await exec('ffmpeg', [
      '-hide_banner',
      ...REEL_INPUT_ARGS,
      '-i',
      file,
      '-vf',
      `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      '-an',
      '-f',
      'null',
      '-',
    ]).catch(e => ({ stdout: '', stderr: String(e?.stderr ?? '') }))
    const cuts = parseSceneCuts(scene.stderr)
    const shots = shotsFromCuts(cuts, durationS, fps)

    const v = visionConfig()
    const read: {
      type: string
      shows: string
      startFrame: number
      durationFrames: number
    }[] = []
    for (const [i, s] of shots.entries()) {
      let verdict = parseShotVerdict(null)
      if (v) {
        const jpg = path.join(dir, `shot-${i}.jpg`)
        await exec('ffmpeg', [
          '-v',
          'error',
          '-ss',
          String((s.startS + s.endS) / 2),
          ...REEL_INPUT_ARGS,
          '-i',
          file,
          '-frames:v',
          '1',
          '-vf',
          'scale=360:-2',
          '-y',
          jpg,
        ]).catch(() => undefined)
        const bytes = await fs.readFile(jpg).catch(() => null)
        if (bytes?.length) {
          const img = `data:image/jpeg;base64,${bytes.toString('base64')}`
          verdict = parseShotVerdict(
            await askVision(v, SHOT_PROMPT, [img]).catch(() => null)
          )
        }
      }
      read.push({
        ...verdict,
        startFrame: s.startFrame,
        durationFrames: s.durationFrames,
      })
    }

    let words: string | null = null
    const w = whisperConfig()
    if (w) {
      const mp3 = path.join(dir, 'voice.mp3')
      await exec('ffmpeg', [
        '-v',
        'error',
        ...REEL_INPUT_ARGS,
        '-i',
        file,
        '-vn',
        '-ac',
        '1',
        '-b:a',
        '64k',
        '-y',
        mp3,
      ])
        .then(
          async () =>
            (words = await whisperBytes(
              w,
              await fs.readFile(mp3),
              'audio/mpeg',
              'voice.mp3',
              120_000
            ))
        )
        .catch(() => undefined)
    }

    return {
      ok: true,
      spec: `${SPEC.KIND}/${SPEC.ID} v${SPEC.VERSION}`,
      durationS,
      fps,
      cuts,
      shots: read,
      rhythm: rhythmAgainstSpec(read),
      transcript: words,
      vision: v ? 'qwen3-vl' : 'not configured',
      next:
        `Make it with their face: a studio frame (${SPEC.FACE_SPEC}), their voice, ` +
        `lipsync ${SPEC.LIPSYNC_MODEL}, one b-roll still per split shot (${SPEC.BROLL_MODEL}), ` +
        `then reel_render ${SPEC.COMPOSITION} with segments from the spec.`,
      template: {
        compositionId: SPEC.COMPOSITION,
        segments: splitSegments(
          Math.round(Math.min(durationS, SPEC.MAX_SECONDS) * SPEC.FPS)
        ),
        captionColor: SPEC.CAPTION_COLOR,
        splitRatio: SPEC.SPLIT_PCT / 100,
      },
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const REEL_ANALYZE_TOOLS: AgentTool[] = [
  {
    name: 'reel_analyze',
    description:
      'Разобрать чужой рилс по ссылке на видео: склейки, где сплит и где полный кадр, что в каждом плане, текст речи, и сравнить ритм со спекой split-reel.t27. Возвращает шаблон SplitTalkingHead, чтобы собрать такой же рилс с лицом и голосом человека. Бесплатно: ffmpeg, whisper и свой vision.', // cyrillic-ok: tool copy
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'прямая ссылка на mp4' }, // cyrillic-ok: tool copy
      },
      required: ['url'],
      additionalProperties: false,
    },
    async handler(a) {
      const url = String(a?.url ?? '')
      if (!/^https?:\/\//i.test(url))
        return { ok: false, why: 'need an http(s) video url' }
      return analyzeReel(url)
    },
  },
]
