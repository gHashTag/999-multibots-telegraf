/*
 * A dedicated open-weights vision endpoint for photos and videos.
 *
 * Why a separate endpoint and not the chat provider: the chat gateway sees
 * images (measured 2026-09-13, 15-40 s per photo, 503 on every second call
 * in a burst) and takes no video at all. The owner asked on 2026-09-13 for
 * an open-source solution for photo and video assets. Apple's open vision
 * models (FastVLM, AIMv2, MobileCLIP, DepthPro, SlowFast-LLaVA) were read
 * first: code and weights ship under the Apple Machine Learning Research
 * Model License, which grants use "exclusively for Research Purposes" and
 * says it "does not include ... use in any commercial product or service"
 * (https://github.com/apple/ml-fastvlm/blob/main/LICENSE_MODEL). This
 * service serves paying clients, so those weights are out. The endpoint we
 * point at instead is llama.cpp `llama-server` (MIT) with an Apache-2.0
 * VLM (Qwen3-VL-2B-Instruct GGUF) on Railway's private network; anything
 * OpenAI-compatible with `image_url` parts works the same.
 *
 * Wire shape: `POST ${base}/chat/completions`, one user message, text part
 * plus N `image_url` parts. Images are inlined as `data:` URLs because the
 * self-hosted server must not be asked to reach our shelf; the bytes are
 * fetched here, from our own shelf only (usableMediaUrl decides).
 *
 * Video: ffmpeg (present in the render image, used for muxing) samples up
 * to FRAMES evenly spaced still frames; the frames go in ONE request so the
 * model can describe the clip as a sequence. Temporal detail between frames
 * is lost by construction -- the description says "frames", not "video".
 *
 * Configured by VISION_API_KEY, VISION_BASE_URL (default the Railway private
 * host), VISION_MODEL (llama-server ignores the name when it serves one
 * model), MEDIA_VISION_TIMEOUT_MS (CPU inference of 2B params takes tens of
 * seconds per frame; default 120 s, floor 10 s). Without a key the caller
 * keeps its previous behaviour: chat provider for images, null for video.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface VisionConfig {
  base: string
  key: string
  model: string
}

/** Runs ffprobe/ffmpeg. Injected so a test never spawns a process. */
export type FrameExec = (
  bin: string,
  args: string[]
) => Promise<{ stdout: string }>

const DEFAULT_BASE = 'http://vision.railway.internal:8000/v1'
const DEFAULT_MODEL = 'qwen3-vl-2b-instruct'
export const VISION_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.MEDIA_VISION_TIMEOUT_MS) || 120_000
)
/** One photo or one video file above this is not fetched. */
const VISION_MAX_BYTES = 40 * 1024 * 1024
/** Still frames sampled from a clip; more frames = more tokens per second of CPU. */
export const VIDEO_FRAMES = 4
/**
 * Longest side of a sampled frame. Measured on the CPU-only Railway `vision`
 * service (Qwen3-VL-2B Q8_0): four 768 px frames became ~3 800 prompt tokens
 * at ~30 tok/s plus ~3 tok/s generation, i.e. over five minutes and past the
 * caller's timeout. 448 px keeps a frame near 150 tokens so a clip fits in
 * well under the budget; MEDIA_VISION_FRAME_SIDE overrides.
 */
const FRAME_SIDE = Math.max(
  224,
  Number(process.env.MEDIA_VISION_FRAME_SIDE) || 448
)
/** Generation budget: CPU decode is slow, so a clip gets a short answer. */
const VIDEO_MAX_TOKENS = 320
const IMAGE_MAX_TOKENS = 500
const FFMPEG_TIMEOUT_MS = 60_000
const TRANSCRIPT_CAP = 4000

export const VISION_PROMPTS = {
  image:
    'Describe in 2-3 sentences what is on the image and quote any visible text verbatim in its original language. Write the description itself in Russian.',
  video:
    'These are still frames taken in order from one video. Describe in 3-5 sentences what happens across the frames, name people, objects and places you can see, and quote any visible text verbatim in its original language. Write the description itself in Russian and start it with the word "Видео:".', // cyrillic-ok
} as const

let visionKeyRefused = false

export function visionConfig(): VisionConfig | null {
  const key = process.env.VISION_API_KEY
  if (!key || visionKeyRefused) return null
  const base = (process.env.VISION_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')
  return { base, key, model: process.env.VISION_MODEL || DEFAULT_MODEL }
}

/** Test seam: forget a refused key between cases. */
export function resetVisionForTests(): void {
  visionKeyRefused = false
}

let frameExec: FrameExec = async (bin, args) => {
  const r = await execFileAsync(bin, args, {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  })
  return { stdout: String(r.stdout ?? '') }
}

/** Test seam: replace ffprobe/ffmpeg with a fake; returns the previous one. */
export function setFrameExecForTests(next: FrameExec | null): FrameExec {
  const prev = frameExec
  if (next) frameExec = next
  return prev
}

async function fetchBytes(
  url: string,
  timeoutMs: number
): Promise<{ bytes: Buffer; mime: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ac.signal })
    if (!r.ok) throw new Error(`shelf answered ${r.status}`)
    const declared = Number(r.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > VISION_MAX_BYTES)
      throw new Error(`file of ${declared} bytes is outside the vision range`)
    const bytes = Buffer.from(await r.arrayBuffer())
    if (!bytes.length || bytes.length > VISION_MAX_BYTES)
      throw new Error(
        `file of ${bytes.length} bytes is outside the vision range`
      )
    return {
      bytes,
      mime: r.headers.get('content-type') || 'application/octet-stream',
    }
  } finally {
    clearTimeout(timer)
  }
}

function dataUrl(bytes: Buffer, mime: string): string {
  const safe = /^image\//.test(mime) ? mime.split(';')[0] : 'image/jpeg'
  return `data:${safe};base64,${bytes.toString('base64')}`
}

/**
 * Ask the vision endpoint one question about one or more images. Throws on
 * a refusal or an unreadable answer so the caller can fall back or keep the
 * row pending; a 401/403 stops further asks for the life of the process.
 */
export async function askVision(
  v: VisionConfig,
  prompt: string,
  images: string[]
): Promise<string | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), VISION_TIMEOUT_MS)
  let r: Response
  try {
    r = await fetch(`${v.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${v.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: v.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...images.map(url => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: images.length > 1 ? VIDEO_MAX_TOKENS : IMAGE_MAX_TOKENS,
        stream: false,
      }),
      signal: ac.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    if (r.status === 401 || r.status === 403) visionKeyRefused = true
    throw new Error(`vision answered ${r.status}: ${body.slice(0, 160)}`)
  }
  const j: any = await r.json()
  const content = j?.choices?.[0]?.message?.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
            .join('')
        : ''
  const clean = text.trim()
  return clean ? clean.slice(0, TRANSCRIPT_CAP) : null
}

/** A photo from our shelf, inlined and described. */
export async function describeImageWithVision(
  v: VisionConfig,
  url: string
): Promise<string | null> {
  const got = await fetchBytes(url, VISION_TIMEOUT_MS)
  return askVision(v, VISION_PROMPTS.image, [dataUrl(got.bytes, got.mime)])
}

/**
 * Sample up to VIDEO_FRAMES stills from a clip on disk. Duration comes from
 * ffprobe; frames sit at the centre of equal slices so a 4-frame sample of
 * a 60 s clip reads 7.5 s, 22.5 s, 37.5 s, 52.5 s. Unknown duration → one
 * frame at the start.
 */
export async function sampleFrames(
  file: string,
  outDir: string,
  frames: number = VIDEO_FRAMES
): Promise<string[]> {
  let duration = 0
  try {
    const probe = await frameExec('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ])
    duration = Number(String(probe.stdout).trim()) || 0
  } catch {
    duration = 0
  }
  const n = duration > 0 ? Math.max(1, frames) : 1
  const out: string[] = []
  for (let i = 0; i < n; i += 1) {
    const at = duration > 0 ? (duration * (i + 0.5)) / n : 0
    const target = path.join(outDir, `frame-${i + 1}.jpg`)
    await frameExec('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      at.toFixed(3),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `scale='min(${FRAME_SIDE},iw)':-2`,
      '-q:v',
      '4',
      target,
    ])
    out.push(target)
  }
  return out
}

/** A video from our shelf: sampled frames, one question, one description. */
export async function describeVideoWithVision(
  v: VisionConfig,
  url: string,
  name: string | null
): Promise<string | null> {
  const got = await fetchBytes(url, VISION_TIMEOUT_MS)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-vision-'))
  try {
    const ext =
      path.extname(name || '') || path.extname(new URL(url).pathname) || '.mp4'
    const file = path.join(dir, `clip${ext}`)
    await fs.writeFile(file, got.bytes)
    const frames = await sampleFrames(file, dir)
    const images: string[] = []
    for (const f of frames) {
      const bytes = await fs.readFile(f).catch(() => null)
      if (bytes && bytes.length) images.push(dataUrl(bytes, 'image/jpeg'))
    }
    if (!images.length) throw new Error('ffmpeg produced no frames')
    return askVision(v, VISION_PROMPTS.video, images)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
