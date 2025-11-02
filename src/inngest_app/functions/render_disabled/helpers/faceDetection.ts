/**
 * Face Detection Helper (Simplified Version)
 *
 * NOTE: This is a simplified implementation without YOLO model.
 * The Python version uses YOLOv8 face detection which requires Python runtime.
 *
 * For production, consider:
 * 1. External API (AWS Rekognition, Google Cloud Vision, Face++)
 * 2. Separate Python microservice with YOLO
 * 3. TensorFlow.js face detection model
 */

import { Logger } from 'inngest'
import axios from 'axios'

export interface FacePosition {
  position: [number, number, number]
  anchor_point: [number, number, number]
  scale: [number, number, number]
}

export interface CircleComposition {
  position: [number, number, number]
  radius: number
}

export interface Composition {
  size: {
    width: number
    height: number
  }
  circle: CircleComposition
}

/**
 * Simplified face detection using image center as fallback
 *
 * TODO: Replace with actual face detection API when available
 */
export async function detectFacePosition(
  imageUrl: string,
  composition: Composition,
  logger: Logger
): Promise<FacePosition> {
  logger.warn('⚠️ Using simplified face detection (center-based). For production, integrate proper face detection API.')

  try {
    // Download image to get dimensions
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
    })

    // For now, use simple center-based positioning
    // In production, this should call a face detection API
    const result: FacePosition = {
      position: [composition.circle.position[0], composition.circle.position[1], 0],
      anchor_point: [composition.size.width / 2, composition.size.height / 2, 0],
      scale: [150, 150, 100], // Default scale for 1:1 aspect ratio
    }

    logger.info(`📍 Face position calculated (center-based): position=${result.position}, anchor=${result.anchor_point}, scale=${result.scale}`)

    return result
  } catch (error) {
    logger.error('Failed to detect face position', { error, imageUrl })

    // Fallback to center position
    return {
      position: [composition.circle.position[0], composition.circle.position[1], 0],
      anchor_point: [composition.size.width / 2, composition.size.height / 2, 0],
      scale: [150, 150, 100],
    }
  }
}

/**
 * Check if face detection should be used
 * Only use if circle_position/circle_scale are NOT provided manually
 */
export function shouldUseFaceDetection(
  circlePosition?: [number, number, number],
  circleScale?: [number, number, number]
): boolean {
  return !circlePosition || !circleScale
}
