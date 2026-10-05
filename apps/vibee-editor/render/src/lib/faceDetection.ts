/**
 * Face Detection Utility using face-api.js
 *
 * Detects face position in video/image for auto-centering
 *
 * THE ENGINE IS LOADED LAZILY, AND ITS ABSENCE IS A STATE, NOT AN ERROR.
 *
 * The default node entry of `@vladmandic/face-api` requires
 * `@tensorflow/tfjs-node`, a native binding removed from the render on
 * purpose (#888, 2026-08-28, vulnerability audit). The other builds the
 * package ships do not help: the bundled ones (`face-api.esm.js`,
 * `face-api.js`) stub node's `util` and throw "util.TextEncoder is not a
 * constructor" while being imported under Node, and `face-api.node-wasm.js`
 * needs `@tensorflow/tfjs` -- 68 more packages, one with a postinstall script.
 *
 * So this module never imports face-api at the top. It tries ONCE, remembers
 * why it could not, and every caller gets the same answer without a stack
 * trace per video: `faceDetectionUnavailable()` names the reason, and
 * `detectFaceIn*` throw `FaceDetectionUnavailableError` (before any ffmpeg
 * work), which callers turn into the plain center crop, `CENTER_CROP`.
 * Loading this file therefore never fails, with or without tfjs-node.
 */

import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'

type FaceApiModule = typeof import('@vladmandic/face-api')
type CanvasModule = typeof import('canvas')

const execFileAsync = promisify(execFile)

/**
 * Frame extraction is bounded, and it does not block the event loop.
 *
 * `-i` here can be a REMOTE url: /analyze-face passes the caller's videoUrl
 * through untouched unless it starts with '/', and ffmpeg fetches http(s)
 * inputs itself. This used to be execFileSync with no timeout, which is two
 * problems at once on a service where every bot shares one process: a server
 * that accepts the connection and then trickles bytes pinned the whole event
 * loop -- not just this request -- for as long as it cared to, and nothing
 * ever timed it out.
 *
 * execFile (async) keeps the process responsive; the timeout bounds the child
 * itself. 60s is generous for pulling one frame and well under the 300s the
 * render path allows a full ffmpeg job (render-server.ts runFfmpeg).
 */
const FRAME_EXTRACT_TIMEOUT_MS = 60_000

/** No face to center on: the frame is used as it is. */
export const CENTER_CROP: Readonly<CropSettings> = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  scale: 1,
})

/** Thrown by detectFaceIn* when the engine cannot run in this process. */
export class FaceDetectionUnavailableError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`face detection unavailable: ${reason}`)
    this.name = 'FaceDetectionUnavailableError'
    this.reason = reason
  }
}

interface FaceEngine {
  faceapi: FaceApiModule
  canvas: CanvasModule
}

let enginePromise: Promise<FaceEngine | null> | null = null
let unavailableReason: string | null = null

/**
 * The engine, or null when it cannot load here. Tried once per process: a
 * missing native binding does not appear between two videos.
 */
function loadEngine(): Promise<FaceEngine | null> {
  enginePromise ??= (async () => {
    try {
      const faceapi: FaceApiModule = await import('@vladmandic/face-api')
      const canvas: CanvasModule = await import('canvas')
      const { Canvas, Image, ImageData } = canvas
      // Patch face-api with canvas implementations
      // @ts-ignore -- node-canvas classes stand in for the DOM ones
      faceapi.env.monkeyPatch({ Canvas, Image, ImageData })
      return { faceapi, canvas }
    } catch (e) {
      unavailableReason = String(e).split('\n')[0].slice(0, 200)
      return null
    }
  })()
  return enginePromise
}

/** The engine, or FaceDetectionUnavailableError naming why not. */
async function requireEngine(): Promise<FaceEngine> {
  const engine = await loadEngine()
  if (!engine) {
    throw new FaceDetectionUnavailableError(unavailableReason ?? 'unknown')
  }
  return engine
}

/**
 * Why face detection cannot run in this process, or null when it can (or has
 * not been tried yet: loadModels() or detectFaceIn* try it).
 */
export function faceDetectionUnavailable(): string | null {
  return unavailableReason
}

let modelsLoaded = false

/**
 * Load face detection models. Throws FaceDetectionUnavailableError when the
 * engine itself cannot load, so a warm-up never reports "ready" falsely.
 */
export async function loadModels(): Promise<void> {
  if (modelsLoaded) return
  const { faceapi } = await requireEngine()

  const modelsPath = path.join(
    process.cwd(),
    'node_modules/@vladmandic/face-api/model'
  )

  console.log('[FaceDetection] Loading models from:', modelsPath)

  // Load SSD MobileNet for face detection (most accurate)
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath)

  modelsLoaded = true
  console.log('[FaceDetection] Models loaded successfully')
}

/**
 * Face detection result
 */
export interface FaceBox {
  x: number // Left edge (0-1)
  y: number // Top edge (0-1)
  width: number // Width (0-1)
  height: number // Height (0-1)
  centerX: number // Center X (0-1)
  centerY: number // Center Y (0-1)
  confidence: number
}

/**
 * Extract first frame from video as PNG
 */
async function extractFrame(videoPath: string): Promise<string> {
  const tempPath = `/tmp/face-frame-${Date.now()}.png`

  // Use ffmpeg to extract first frame (аргументы массивом — без шелла)
  await execFileAsync(
    'ffmpeg',
    [
      '-i',
      videoPath,
      '-vf',
      'select=eq(n\\,0)',
      '-vframes',
      '1',
      '-y',
      tempPath,
    ],
    { timeout: FRAME_EXTRACT_TIMEOUT_MS }
  )

  return tempPath
}

/**
 * Detect face in image file
 */
export async function detectFaceInImage(
  imagePath: string
): Promise<FaceBox | null> {
  const { faceapi, canvas } = await requireEngine()
  await loadModels()

  // Load image using canvas
  const img = await canvas.loadImage(imagePath)

  // Create canvas and draw image
  const cvs = canvas.createCanvas(img.width, img.height)
  const ctx = cvs.getContext('2d')
  ctx.drawImage(img, 0, 0)

  // Detect face
  const detections = await faceapi.detectAllFaces(
    cvs as unknown as HTMLCanvasElement,
    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
  )

  if (detections.length === 0) {
    console.log('[FaceDetection] No face detected')
    return null
  }

  // Get largest face (most likely the main subject)
  const largestFace = detections.reduce((prev, curr) =>
    curr.box.area > prev.box.area ? curr : prev
  )

  const box = largestFace.box

  const result: FaceBox = {
    x: box.x / img.width,
    y: box.y / img.height,
    width: box.width / img.width,
    height: box.height / img.height,
    centerX: (box.x + box.width / 2) / img.width,
    centerY: (box.y + box.height / 2) / img.height,
    confidence: largestFace.score,
  }

  console.log('[FaceDetection] Face detected:', result)
  return result
}

/**
 * Detect face in video (extracts first frame)
 */
export async function detectFaceInVideo(
  videoPath: string
): Promise<FaceBox | null> {
  // Before ffmpeg: no frame is worth pulling when nothing can look at it.
  await requireEngine()
  console.log('[FaceDetection] Analyzing video:', videoPath)

  // Extract first frame
  const framePath = await extractFrame(videoPath)

  try {
    // Detect face in frame
    const result = await detectFaceInImage(framePath)
    return result
  } finally {
    // Cleanup temp file
    if (fs.existsSync(framePath)) {
      fs.unlinkSync(framePath)
    }
  }
}

/**
 * Calculate crop/offset to center face
 */
export interface CropSettings {
  // Offset to apply to video position (as percentage)
  offsetX: number // -50 to 50 (negative = move left)
  offsetY: number // -50 to 50 (negative = move up)
  // Scale factor (1.0 = no zoom, >1 = zoom in)
  scale: number
}

export function calculateCropSettings(
  faceBox: FaceBox,
  targetAspect: 'square' | 'portrait' | 'circle' = 'portrait'
): CropSettings {
  // Face center offset from frame center
  const offsetX = (0.5 - faceBox.centerX) * 100
  const offsetY = (0.5 - faceBox.centerY) * 100

  // Calculate scale to make face prominent
  // For portrait/TikTok style, face should be ~30-40% of frame height
  const targetFaceHeight = 0.35
  const scale = Math.min(2.0, Math.max(1.0, targetFaceHeight / faceBox.height))

  return {
    offsetX,
    offsetY,
    scale,
  }
}
