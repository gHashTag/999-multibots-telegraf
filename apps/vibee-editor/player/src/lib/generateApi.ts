// ===============================
// AI Generation API Client
// Calls Vibee MCP server for AI generations
// Connected to 40+ AI tools in Gleam backend
// ===============================

import { API_BASE } from '../config'
import { isTelegram } from './telegram'
import { isAdmin } from '../config/admin'
import { toAbsoluteUrl } from './mediaUrl'
import { authHeaders as sharedAuthHeaders } from './apiFetch'

// Use Vibee MCP for AI generations (not render server)
const API_URL = API_BASE

// ═══════════════════════════════════════════════════════════════════════════
// DEV/MOCK-РЕЖИМ — тестировать ВСЕ функции в мини-аппе БЕЗ денег.
//
// Включить: открой мини-апп с ?mock=1 (запомнится в localStorage), либо
// localStorage.vibee_mock=1, либо сборка с VITE_MOCK=1. Выключить: ?mock=0.
// Из консоли: vibeeMock(true) / vibeeMock(false).
//
// В mock-режиме КАЖДЫЙ вызов генерации/провайдера мгновенно возвращает образец
// — ни одного реального запроса, ноль расходов. Клиентская эмуляция: работает
// и в проде (Telegram), сервер не нужен. Реализовано через mfetch: он подменяет
// сеть образцовым ответом, поэтому все функции ниже трогать не пришлось.
// ═══════════════════════════════════════════════════════════════════════════
const realFetch = globalThis.fetch.bind(globalThis)
export function isMockMode(): boolean {
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('mock') === '1') localStorage.setItem('vibee_mock', '1')
    if (p.get('mock') === '0') localStorage.removeItem('vibee_mock')
    const requested =
      localStorage.getItem('vibee_mock') === '1' ||
      (import.meta.env.VITE_MOCK as string) === '1'
    if (!requested) return false

    // Localhost is the explicit no-network test surface even when the loaded
    // Telegram SDK reports a non-unknown platform in a desktop browser.
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true

    // In production Telegram a paying non-admin must never receive a fake
    // result instead of the requested generation.
    if (isTelegram() && !isAdmin()) return false
    return true
  } catch {
    return false
  }
}
try {
  ;(window as unknown as Record<string, unknown>).vibeeMock = (on: boolean) => {
    on
      ? localStorage.setItem('vibee_mock', '1')
      : localStorage.removeItem('vibee_mock')
    return isMockMode()
  }
} catch {
  /* вне браузера */
}
const MOCK = {
  image: 'https://files.catbox.moe/941yaw.jpg',
  video:
    'https://bucket-production-8259.up.railway.app/vibee-assets/renders/1787915527491-8326cd6d-ee77-4820-b1da-e4a2ff49a6bc.mp4',
  reel: 'https://bucket-production-8259.up.railway.app/vibee-assets/renders/1787912936286-f1fbca0a-8bdb-4d85-ad84-dfdd70ce529d.mp4',
  audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
}
/** Образец по адресу эндпоинта: видео/аудио/картинка — по ключевым словам. */
function mockBody(url: string): Record<string, unknown> {
  const u = url.toLowerCase()
  const media = /audio|voice|tts|transcribe|speech/.test(u)
    ? MOCK.audio
    : /video|kling|heygen|broll|lipsync|hedra|morph|seedance|reel|render|veo/.test(
          u
        )
      ? MOCK.video
      : MOCK.image
  return {
    success: true,
    url: media,
    output: media,
    id: 'mock-' + Date.now(),
    status: 'succeeded',
    provider: 'mock',
    mock: true,
  }
}
/** Сеть с учётом mock: в dev-режиме возвращает образцовый Response, без запроса. */
function mfetch(url: string, init?: RequestInit): Promise<Response> {
  if (isMockMode()) {
    return Promise.resolve(
      new Response(JSON.stringify(mockBody(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  }
  return realFetch(url, init)
}

/**
 * One identity path for paid generations. The shared helper chooses Telegram
 * initData inside the Mini App and the server-issued Bearer session in a web
 * browser or iOS. Previously Generate only knew about the Telegram header, so
 * an authenticated browser profile still received 401. In DEV, where neither
 * real identity is present, a separate agent key remains available.
 */
export function generationAuthHeaders(): Headers {
  const headers = sharedAuthHeaders()
  if (headers.has('X-Telegram-Init-Data') || headers.has('Authorization')) {
    return headers
  }
  const devKey = import.meta.env.DEV
    ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
    : undefined
  if (devKey) headers.set('X-Agent-Key', devKey)
  return headers
}

export interface GenerateImageParams {
  model: string // 'flux-pro-1.1', 'flux-dev', 'flux-lora'
  prompt: string
  aspectRatio: string // '1:1', '16:9', '9:16', '4:3'
}

export interface GenerateVideoParams {
  model: string // 'kling-std', 'kling-pro', 'veo3-fast', 'veo3-quality'
  prompt: string
  duration: string // '5s', '10s'
  aspectRatio: string
}

export interface GenerateAudioParams {
  model?: string
  text: string
  voiceId: string // 'sarah', 'rachel', 'josh', 'adam', 'bella'
  voiceName?: string
  speed: number // 0.5 - 2.0
}

export interface GenerateLipsyncParams {
  model?: string
  audioUrl: string
  imageUrl: string
  resolution: string // '480p', '720p', '1080p'
  aspectRatio: string
}

export interface GenerateResult {
  success: boolean
  url?: string
  id?: string
  error?: string
  /** Actual media alignment; absent when the provider cannot supply timing. */
  timed_captions?: unknown
}

// Helper for aspect ratio to dimensions
function aspectRatioToDimensions(ratio: string): {
  width: number
  height: number
} {
  const ratios: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '4:3': { width: 1024, height: 768 },
  }
  return ratios[ratio] || ratios['16:9']
}

/**
 * Generate an image using FLUX AI
 */
export async function generateImage(
  params: GenerateImageParams
): Promise<GenerateResult> {
  const { width, height } = aspectRatioToDimensions(params.aspectRatio)

  const response = await mfetch(`${API_URL}/api/generate/image`, {
    method: 'POST',
    headers: generationAuthHeaders(),
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      width,
      height,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Image generation failed' }
  }

  return response.json()
}

/**
 * Generate an image using Replicate API (via Vite proxy)
 * Model format: 'owner/name:version-hash' or just 'version-hash'
 * We extract only the version hash since Replicate's API expects only the hash in the 'version' field
 */
export async function generateImageViaReplicate(params: {
  model: string // e.g., 'stability-ai/sdxl:abc123...', or just 'abc123...'
  prompt: string
  aspectRatio: string
}): Promise<GenerateResult> {
  const { width, height } = aspectRatioToDimensions(params.aspectRatio)

  // Extract version hash from model string (e.g., 'owner/model:hash' -> 'hash')
  // If already just a hash, use it as-is
  const versionHash = params.model.includes(':')
    ? params.model.split(':')[1]
    : params.model

  // NOT REACHABLE FROM THE UI RIGHT NOW. The replicate:* image models were
  // removed from GeneratePanel because this path has no production backend:
  // /api/replicate/predictions exists only as Vite dev middleware, and the
  // deployed player is static files behind nginx with no /api proxy. Kept, with
  // an absolute URL like every other replicate call in this file, so that IF a
  // render-server route is ever added the request goes to the right host and
  // fails visibly instead of silently receiving the SPA's index.html.
  const createResponse = await mfetch(`${API_URL}/api/replicate/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: versionHash, // Send only the hash, not the full model path
      input: {
        prompt: params.prompt,
        width,
        height,
        num_outputs: 1,
      },
    }),
  })

  if (!createResponse.ok) {
    const text = await createResponse.text()
    return { success: false, error: text || 'Replicate API error' }
  }

  const prediction = await createResponse.json()

  // If status is 'succeeded', return the output
  if (prediction.status === 'succeeded' && prediction.output) {
    const imageUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output
    return { success: true, url: imageUrl, id: prediction.id }
  }

  // If status is 'processing', poll for result
  if (prediction.status === 'processing' || prediction.status === 'starting') {
    const getUrl = prediction.urls?.get
    if (!getUrl) {
      return { success: false, error: 'No poll URL in response' }
    }

    // Poll for result (max 2 minutes)
    const maxAttempts = 60
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s

      const pollResponse = await mfetch(
        `${API_URL}/api/replicate/poll?url=${encodeURIComponent(getUrl)}`
      )

      if (!pollResponse.ok) continue

      const result = await pollResponse.json()

      if (result.status === 'succeeded' && result.output) {
        const imageUrl = Array.isArray(result.output)
          ? result.output[0]
          : result.output
        return { success: true, url: imageUrl, id: result.id }
      }

      if (result.status === 'failed' || result.status === 'canceled') {
        return { success: false, error: result.error || 'Generation failed' }
      }
    }

    return { success: false, error: 'Generation timeout' }
  }

  // Handle immediate failure
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    return { success: false, error: prediction.error || 'Generation failed' }
  }

  return { success: false, error: 'Unknown status' }
}

/**
 * Generate a video using Kling/Veo3 AI
 */
export async function generateVideo(
  params: GenerateVideoParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/generate/video`, {
    method: 'POST',
    headers: generationAuthHeaders(),
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: params.aspectRatio,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video generation failed' }
  }

  return response.json()
}

/**
 * Generate audio using ElevenLabs TTS
 */
export async function generateAudio(
  params: GenerateAudioParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/generate/audio`, {
    method: 'POST',
    headers: generationAuthHeaders(),
    body: JSON.stringify({
      model: params.model,
      text: params.text,
      voice_id: params.voiceId,
      voice_name: params.voiceName,
      speed: params.speed,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Audio generation failed' }
  }

  return response.json()
}

/**
 * Generate lipsync video using Hedra
 */
export async function generateLipsync(
  params: GenerateLipsyncParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/generate/lipsync`, {
    method: 'POST',
    headers: generationAuthHeaders(),
    body: JSON.stringify({
      model: params.model,
      audio_url: toAbsoluteUrl(params.audioUrl),
      image_url: toAbsoluteUrl(params.imageUrl),
      resolution: params.resolution,
      aspect_ratio: params.aspectRatio,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Lipsync generation failed' }
  }

  return response.json()
}

// ============================================================
// KLING AI API
// ============================================================

export interface KlingVideoParams {
  prompt: string
  duration?: string // '5' or '10'
  mode?: string // 'std' or 'pro'
  aspectRatio?: string
}

export interface KlingI2VParams {
  imageUrl: string
  prompt?: string
  duration?: string
}

/**
 * Generate video using Kling AI
 */
export async function klingCreateVideo(
  params: KlingVideoParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/kling/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      duration: params.duration,
      mode: params.mode,
      aspect_ratio: params.aspectRatio,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Kling video generation failed' }
  }

  return response.json()
}

/**
 * Image to video using Kling AI
 */
export async function klingImageToVideo(
  params: KlingI2VParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/kling/i2v`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: params.imageUrl,
      prompt: params.prompt,
      duration: params.duration,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Kling I2V failed' }
  }

  return response.json()
}

/**
 * Get Kling task status
 */
export async function klingGetTask(taskId: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/kling/task/${taskId}`)
  return response.json()
}

/**
 * List Kling tasks
 */
export async function klingListTasks(): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/kling/tasks`)
  return response.json()
}

// ============================================================
// HEYGEN API
// ============================================================

export interface HeyGenVideoParams {
  avatarId: string
  script: string
}

/**
 * Create HeyGen video with avatar
 */
export async function heygenCreateVideo(
  params: HeyGenVideoParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/heygen/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      avatar_id: params.avatarId,
      script: params.script,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'HeyGen video failed' }
  }

  return response.json()
}

/**
 * List HeyGen avatars
 */
export async function heygenListAvatars(): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/heygen/avatars`)
  return response.json()
}

/**
 * List HeyGen voices
 */
export async function heygenListVoices(): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/heygen/voices`)
  return response.json()
}

/**
 * Get HeyGen video status
 */
export async function heygenGetStatus(
  videoId: string
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/heygen/status/${videoId}`)
  return response.json()
}

// ============================================================
// FAL.AI API
// ============================================================

export interface NeuroPhotoParams {
  prompt: string
  loraUrl: string
}

export interface FluxKontextParams {
  prompt: string
  inputImageUrl: string
  modelType?: string // 'pro' or 'max'
  aspectRatio?: string
}

export interface NanoBananaParams {
  prompt: string
  aspectRatio?: string
  resolution?: string // '1K', '2K'
}

/**
 * Generate NeuroPhoto with FLUX LoRA
 */
export async function falNeuroPhoto(
  params: NeuroPhotoParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/fal/neuro-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      lora_url: params.loraUrl,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'NeuroPhoto failed' }
  }

  return response.json()
}

/**
 * Edit image using FLUX Kontext
 */
export async function falFluxKontext(
  params: FluxKontextParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/fal/flux-kontext`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      input_image_url: params.inputImageUrl,
      model_type: params.modelType,
      aspect_ratio: params.aspectRatio,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Flux Kontext failed' }
  }

  return response.json()
}

/**
 * Generate image using Nano Banana Pro
 */
export async function falNanoBanana(
  params: NanoBananaParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/fal/nano-banana`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      resolution: params.resolution,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Nano Banana failed' }
  }

  return response.json()
}

/**
 * Get FAL queue status
 */
export async function falGetStatus(requestId: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/fal/status/${requestId}`)
  return response.json()
}

/**
 * Get FAL queue result
 */
export async function falGetResult(requestId: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/fal/result/${requestId}`)
  return response.json()
}

// ============================================================
// REPLICATE API
// ============================================================

export interface ReplicateLipsyncParams {
  videoUrl: string
  audioUrl: string
}

export interface ReplicateMorphingParams {
  startImageUrl: string
  endImageUrl: string
  prompt?: string
  duration?: string
}

export interface ReplicateFaceswapParams {
  targetImageUrl: string
  swapImageUrl: string
}

export interface ReplicateUpscaleParams {
  imageUrl: string
  scale?: number // 2 or 4
}

export interface ReplicateTrainLoraParams {
  imagesZipUrl: string
  triggerWord: string
  modelName: string
}

/**
 * Lipsync video using Replicate
 */
export async function replicateLipsync(
  params: ReplicateLipsyncParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/replicate/lipsync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: params.videoUrl,
      audio_url: params.audioUrl,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Replicate lipsync failed' }
  }

  return response.json()
}

/**
 * Image morphing using Replicate
 */
export async function replicateMorphing(
  params: ReplicateMorphingParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/replicate/morphing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_image_url: params.startImageUrl,
      end_image_url: params.endImageUrl,
      prompt: params.prompt,
      duration: params.duration,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Replicate morphing failed' }
  }

  return response.json()
}

/**
 * Face swap using Replicate
 */
export async function replicateFaceswap(
  params: ReplicateFaceswapParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/replicate/faceswap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_image_url: params.targetImageUrl,
      swap_image_url: params.swapImageUrl,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Replicate faceswap failed' }
  }

  return response.json()
}

/**
 * Upscale image using Replicate
 */
export async function replicateUpscale(
  params: ReplicateUpscaleParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/replicate/upscale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: params.imageUrl,
      scale: params.scale,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Replicate upscale failed' }
  }

  return response.json()
}

/**
 * Train LoRA model using Replicate
 */
export async function replicateTrainLora(
  params: ReplicateTrainLoraParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/replicate/train-lora`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images_zip_url: params.imagesZipUrl,
      trigger_word: params.triggerWord,
      model_name: params.modelName,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Replicate LoRA training failed' }
  }

  return response.json()
}

// ============================================================
// OPENAI API
// ============================================================

export interface OpenAITranscribeParams {
  audioUrl: string
  language?: string
}

export interface OpenAIVisionParams {
  imageUrl: string
  prompt?: string
}

export interface OpenAIImprovePromptParams {
  prompt: string
  style?: string
}

/**
 * Transcribe audio using Whisper
 */
export async function openaiTranscribe(
  params: OpenAITranscribeParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/openai/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_url: params.audioUrl,
      language: params.language,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'OpenAI transcribe failed' }
  }

  return response.json()
}

/**
 * Analyze image using GPT-4 Vision
 */
export async function openaiVision(
  params: OpenAIVisionParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/openai/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: params.imageUrl,
      prompt: params.prompt,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'OpenAI vision failed' }
  }

  return response.json()
}

/**
 * Improve/enhance prompt using GPT
 */
export async function openaiImprovePrompt(
  params: OpenAIImprovePromptParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/openai/improve-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      style: params.style,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'OpenAI improve prompt failed' }
  }

  return response.json()
}

// ============================================================
// VIDEO EDITING API (FFmpeg)
// ============================================================

export interface VideoConcatParams {
  videoUrls: string[]
}

export interface VideoTrimParams {
  videoUrl: string
  startTime: string // e.g., '00:00:05'
  duration: string // e.g., '00:00:10'
}

export interface VideoWatermarkParams {
  videoUrl: string
  watermarkUrl: string
  position?: string // 'bottomright', 'topleft', etc.
}

export interface VideoAddAudioParams {
  videoUrl: string
  audioUrl: string
}

/**
 * Concatenate multiple videos
 */
export async function videoConcat(
  params: VideoConcatParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/video/concat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_urls: params.videoUrls,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video concat failed' }
  }

  return response.json()
}

/**
 * Trim video
 */
export async function videoTrim(
  params: VideoTrimParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/video/trim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: params.videoUrl,
      start_time: params.startTime,
      duration: params.duration,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video trim failed' }
  }

  return response.json()
}

/**
 * Add watermark to video
 */
export async function videoWatermark(
  params: VideoWatermarkParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/video/watermark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: params.videoUrl,
      watermark_url: params.watermarkUrl,
      position: params.position,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video watermark failed' }
  }

  return response.json()
}

/**
 * Add audio track to video
 */
export async function videoAddAudio(
  params: VideoAddAudioParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/video/add-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: params.videoUrl,
      audio_url: params.audioUrl,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video add audio failed' }
  }

  return response.json()
}

/**
 * Extract audio from video
 */
export async function videoExtractAudio(
  videoUrl: string
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/video/extract-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_url: videoUrl }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video extract audio failed' }
  }

  return response.json()
}

/**
 * Get video info
 */
export async function videoInfo(videoUrl: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/video/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_url: videoUrl }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Video info failed' }
  }

  return response.json()
}

// ============================================================
// B-ROLL API
// ============================================================

export interface BrollGenerateParams {
  category?: string // 'abstract', 'nature', 'business', etc.
  templateName?: string
  customPrompt?: string
  model?: string // 'kling' or 'veo3'
}

/**
 * Generate B-Roll video
 */
export async function brollGenerate(
  params: BrollGenerateParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/broll/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: params.category,
      template_name: params.templateName,
      custom_prompt: params.customPrompt,
      model: params.model,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'B-Roll generate failed' }
  }

  return response.json()
}

/**
 * List B-Roll templates
 */
export async function brollListTemplates(
  category?: string
): Promise<GenerateResult> {
  const url = category
    ? `${API_URL}/api/broll/templates?category=${category}`
    : `${API_URL}/api/broll/templates`
  const response = await mfetch(url)
  return response.json()
}

// ============================================================
// VOICE CLONE API
// ============================================================

export interface VoiceCloneParams {
  name: string
  audioUrl: string
  description?: string
}

/**
 * Clone a voice from audio
 */
export async function voiceClone(
  params: VoiceCloneParams
): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/voices/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      audio_url: params.audioUrl,
      description: params.description,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: text || 'Voice clone failed' }
  }

  return response.json()
}

/**
 * Delete a cloned voice
 */
export async function voiceDelete(voiceId: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/voices/${voiceId}`, {
    method: 'DELETE',
  })
  return response.json()
}

// ============================================================
// HEDRA STATUS API
// ============================================================

/**
 * Get Hedra job status
 */
export async function hedraGetStatus(jobId: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/hedra/status/${jobId}`)
  return response.json()
}

/**
 * List Hedra jobs
 */
export async function hedraListJobs(): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/hedra/jobs`)
  return response.json()
}

// ============================================================
// BFL (FLUX) STATUS API
// ============================================================

/**
 * Get BFL task result
 */
export async function bflGetResult(taskId: string): Promise<GenerateResult> {
  const response = await mfetch(`${API_URL}/api/bfl/result/${taskId}`)
  return response.json()
}
