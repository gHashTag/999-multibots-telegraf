import { calculateFinalImageCostInStars } from './IMAGES_MODELS'

interface FluxKontextModelInfo {
  shortName: string
  description_en: string
  description_ru: string
  costPerImage: number
  previewImage: string
  inputType: ('text' | 'image')[]
  category: 'image-editing'
}

export const FLUX_KONTEXT_MODELS: Record<string, FluxKontextModelInfo> = {
  'black-forest-labs/flux-kontext-pro': {
    shortName: 'FLUX Kontext [pro]',
    description_en: `State-of-the-art performance for image editing. High-quality outputs, great prompt following, and consistent results. Perfect for professional image editing workflows with precise control and excellent text understanding.`,
    description_ru: `Современная производительность для редактирования изображений. Высококачественные результаты, отличное следование промптам и стабильные результаты. Идеально для профессиональных рабочих процессов редактирования изображений с точным контролем и отличным пониманием текста.`,
    previewImage:
      'https://replicate.delivery/pbxt/N55l5TWGh8mSlNzW8usReoaNhGbFwvLeZR3TX1NL4pd2Wtfv/replicate-prediction-f2d25rg6gnrma0cq257vdw2n4c.png',
    costPerImage: calculateFinalImageCostInStars(0.055),
    inputType: ['text', 'image'],
    category: 'image-editing',
  },
  'black-forest-labs/flux-kontext-max': {
    shortName: 'FLUX Kontext [max]',
    description_en: `A premium model that brings maximum performance, improved prompt adherence, and high-quality typography generation without compromise on speed. Best for complex editing tasks and professional typography work.`,
    description_ru: `Премиальная модель, обеспечивающая максимальную производительность, улучшенное следование промптам и высококачественную генерацию типографики без компромиссов в скорости. Лучше всего для сложных задач редактирования и профессиональной работы с типографикой.`,
    previewImage:
      'https://replicate.delivery/pbxt/N55l5TWGh8mSlNzW8usReoaNhGbFwvLeZR3TX1NL4pd2Wtfv/replicate-prediction-f2d25rg6gnrma0cq257vdw2n4c.png',
    costPerImage: calculateFinalImageCostInStars(0.075),
    inputType: ['text', 'image'],
    category: 'image-editing',
  },
}

// Экспорт для использования в основном конфиге моделей
export default FLUX_KONTEXT_MODELS
