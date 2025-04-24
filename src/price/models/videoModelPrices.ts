import { VIDEO_MODELS_CONFIG } from '@/config/models.config'

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

// Используем ключи конфига как основу для цен
export const videoModelPrices: Partial<Record<VideoModelKey, number>> = {
  // Цены берутся из VIDEO_MODELS_CONFIG.basePrice
  // Этот файл может быть избыточен, если цены используются только из конфига.
  minimax: VIDEO_MODELS_CONFIG.minimax.basePrice,
  'haiper-video-2': VIDEO_MODELS_CONFIG['haiper-video-2'].basePrice,
  'ray-v2': VIDEO_MODELS_CONFIG['ray-v2'].basePrice,
  'wan-image-to-video': VIDEO_MODELS_CONFIG['wan-image-to-video'].basePrice,
  'wan-text-to-video': VIDEO_MODELS_CONFIG['wan-text-to-video'].basePrice,
  'kling-v1.6-pro': VIDEO_MODELS_CONFIG['kling-v1.6-pro'].basePrice,
  'hunyuan-video-fast': VIDEO_MODELS_CONFIG['hunyuan-video-fast'].basePrice,
}
