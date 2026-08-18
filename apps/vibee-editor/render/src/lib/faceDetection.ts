/**
 * Face Detection Utility using face-api.js
 *
 * Detects face position in video/image for auto-centering
 */

import * as faceapi from '@vladmandic/face-api';
import * as canvas from 'canvas';
import * as path from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';

const { Canvas, Image, ImageData } = canvas;

// Patch face-api with canvas implementations
// @ts-ignore
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

/**
 * Load face detection models
 */
export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;

  const modelsPath = path.join(
    process.cwd(),
    'node_modules/@vladmandic/face-api/model'
  );

  console.log('[FaceDetection] Loading models from:', modelsPath);

  // Load SSD MobileNet for face detection (most accurate)
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);

  modelsLoaded = true;
  console.log('[FaceDetection] Models loaded successfully');
}

/**
 * Face detection result
 */
export interface FaceBox {
  x: number;      // Left edge (0-1)
  y: number;      // Top edge (0-1)
  width: number;  // Width (0-1)
  height: number; // Height (0-1)
  centerX: number; // Center X (0-1)
  centerY: number; // Center Y (0-1)
  confidence: number;
}

/**
 * Extract first frame from video as PNG
 */
async function extractFrame(videoPath: string): Promise<string> {
  const tempPath = `/tmp/face-frame-${Date.now()}.png`;

  // Use ffmpeg to extract first frame
  execSync(
    `ffmpeg -i "${videoPath}" -vf "select=eq(n\\,0)" -vframes 1 -y "${tempPath}"`,
    { stdio: 'pipe' }
  );

  return tempPath;
}

/**
 * Detect face in image file
 */
export async function detectFaceInImage(imagePath: string): Promise<FaceBox | null> {
  await loadModels();

  // Load image using canvas
  const img = await canvas.loadImage(imagePath);

  // Create canvas and draw image
  const cvs = canvas.createCanvas(img.width, img.height);
  const ctx = cvs.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Detect face
  const detections = await faceapi.detectAllFaces(
    cvs as unknown as HTMLCanvasElement,
    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
  );

  if (detections.length === 0) {
    console.log('[FaceDetection] No face detected');
    return null;
  }

  // Get largest face (most likely the main subject)
  const largestFace = detections.reduce((prev, curr) =>
    curr.box.area > prev.box.area ? curr : prev
  );

  const box = largestFace.box;

  const result: FaceBox = {
    x: box.x / img.width,
    y: box.y / img.height,
    width: box.width / img.width,
    height: box.height / img.height,
    centerX: (box.x + box.width / 2) / img.width,
    centerY: (box.y + box.height / 2) / img.height,
    confidence: largestFace.score,
  };

  console.log('[FaceDetection] Face detected:', result);
  return result;
}

/**
 * Detect face in video (extracts first frame)
 */
export async function detectFaceInVideo(videoPath: string): Promise<FaceBox | null> {
  console.log('[FaceDetection] Analyzing video:', videoPath);

  // Extract first frame
  const framePath = await extractFrame(videoPath);

  try {
    // Detect face in frame
    const result = await detectFaceInImage(framePath);
    return result;
  } finally {
    // Cleanup temp file
    if (fs.existsSync(framePath)) {
      fs.unlinkSync(framePath);
    }
  }
}

/**
 * Calculate crop/offset to center face
 */
export interface CropSettings {
  // Offset to apply to video position (as percentage)
  offsetX: number; // -50 to 50 (negative = move left)
  offsetY: number; // -50 to 50 (negative = move up)
  // Scale factor (1.0 = no zoom, >1 = zoom in)
  scale: number;
}

export function calculateCropSettings(
  faceBox: FaceBox,
  targetAspect: 'square' | 'portrait' | 'circle' = 'portrait'
): CropSettings {
  // Face center offset from frame center
  const offsetX = (0.5 - faceBox.centerX) * 100;
  const offsetY = (0.5 - faceBox.centerY) * 100;

  // Calculate scale to make face prominent
  // For portrait/TikTok style, face should be ~30-40% of frame height
  const targetFaceHeight = 0.35;
  const scale = Math.min(2.0, Math.max(1.0, targetFaceHeight / faceBox.height));

  return {
    offsetX,
    offsetY,
    scale,
  };
}
