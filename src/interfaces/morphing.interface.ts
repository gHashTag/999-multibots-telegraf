/**
 * Morphing Interface
 * Интерфейсы для функций морфинга изображений
 */

/**
 * Типы морфинга
 */
export enum MorphingType {
  FACE_SWAP = 'face_swap',
  STYLE_TRANSFER = 'style_transfer',
  AGE_TRANSFORMATION = 'age_transformation',
  GENDER_SWAP = 'gender_swap',
  Kling_MORPHING = 'kling_morphing',
}

/**
 * Параметры для морфинга
 */
export interface MorphingParams {
  sourceImage: string
  targetImage: string
  type: MorphingType
  intensity?: number
  duration?: number
}

/**
 * Результат морфинга
 */
export interface MorphingResult {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  video_url?: string
  image_url?: string
  error?: string
}

/**
 * Сервис морфинга
 */
export interface IMorphingService {
  createMorphing(params: MorphingParams): Promise<string>
  getStatus(id: string): Promise<MorphingResult>
  waitForCompletion(id: string): Promise<MorphingResult>
}

export default {
  MorphingType,
  MorphingParams,
  MorphingResult,
  IMorphingService,
}
