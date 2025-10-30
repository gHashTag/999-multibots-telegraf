/**
 * 🧪 AI PHOTOSHOP TEST FIXTURES AND MOCK DATA
 *
 * Центральный источник тестовых данных для всех AI Photoshop тестов
 */

export const MOCK_USER_DATA = {
  telegram_id: '123456789',
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  is_ru: true
}

export const MOCK_IMAGES = {
  single: {
    url: 'https://example.com/test-image.jpg',
    filename: 'test-image.jpg',
    mimeType: 'image/jpeg',
    size: 2048576, // 2MB
    width: 1920,
    height: 1080
  },
  multi: [
    {
      url: 'https://example.com/image1.jpg',
      filename: 'image1.jpg',
      mimeType: 'image/jpeg',
      size: 1500000,
      width: 1024,
      height: 1536
    },
    {
      url: 'https://example.com/image2.jpg',
      filename: 'image2.jpg',
      mimeType: 'image/jpeg',
      size: 1800000,
      width: 1024,
      height: 1536
    },
    {
      url: 'https://example.com/image3.png',
      filename: 'image3.png',
      mimeType: 'image/png',
      size: 2200000,
      width: 1024,
      height: 1536
    }
  ],
  buffer_images: [
    {
      buffer: Buffer.from('fake-jpeg-data-1'),
      filename: 'ai_photoshop_image_1.jpg',
      timestamp: 1698765432000,
      originalOrder: 1
    },
    {
      buffer: Buffer.from('fake-jpeg-data-2'),
      filename: 'ai_photoshop_image_2.jpg',
      timestamp: 1698765433000,
      originalOrder: 2
    }
  ]
}

export const MOCK_PROMPTS = {
  valid: [
    'enhance this beautiful image with artistic style',
    'merge these two photos together seamlessly',
    'create a professional portrait with studio lighting',
    'apply vintage filter with sepia tones and film grain',
    'combine these landscape photos into panoramic view'
  ],
  invalid: [
    '', // Empty
    'hi', // Too short
    'a'.repeat(2001), // Too long
    '   ', // Whitespace only
    '\t\t\t' // Tabs only
  ],
  multi_photo: [
    'merge these images together',
    'combine these photos into collage',
    'blend these portraits seamlessly',
    'create montage from these pictures',
    'stitch these photos into panorama'
  ],
  style_based: {
    artistic: 'artistic style, creative composition, vibrant colors, detailed artwork',
    portrait: 'professional portrait, high quality, studio lighting, detailed face',
    photorealistic: 'photorealistic, ultra detailed, high resolution, professional photography',
    fantasy: 'fantasy style, magical atmosphere, mystical elements, epic composition',
    cyberpunk: 'cyberpunk style, neon lights, futuristic, technological atmosphere',
    vintage: 'vintage style, retro aesthetic, classic composition, nostalgic mood'
  }
}

export const MOCK_SIZES = {
  '1K': {
    dimensions: { width: 1024, height: 1536 },
    cost: 15,
    name: '1K'
  },
  '2K': {
    dimensions: { width: 1365, height: 2048 },
    cost: 20,
    name: '2K'
  },
  '4K': {
    dimensions: { width: 2731, height: 4096 },
    cost: 30,
    name: '4K'
  },
  custom: {
    dimensions: { width: 1200, height: 1600 },
    cost: 25,
    name: 'custom'
  }
}

export const MOCK_MODELS = {
  seedream: {
    key: 'seedream',
    title_ru: '🎭 SeeDream-4',
    title_en: '🎭 SeeDream-4',
    cost: 15,
    supports_multi_image: true,
    max_images: 10
  },
  nano_banana: {
    key: 'nano_banana',
    title_ru: '🍌 Nano Banana',
    title_en: '🍌 Nano Banana',
    cost: 12,
    supports_multi_image: true,
    max_images: 3
  },
  flux_max: {
    key: 'flux_max',
    title_ru: '🚀 FLUX Kontext Max',
    title_en: '🚀 FLUX Kontext Max',
    cost: 5,
    supports_multi_image: true,
    max_images: 10
  }
}

export const MOCK_SESSION_STATES = {
  initial: {
    aiPhotoshopModel: undefined,
    aiPhotoshopStyle: undefined,
    aiPhotoshopSize: undefined,
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: undefined,
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: []
  },
  model_selected: {
    aiPhotoshopModel: 'seedream',
    aiPhotoshopStyle: undefined,
    aiPhotoshopSize: undefined,
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: 'style_select',
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: []
  },
  style_selected: {
    aiPhotoshopModel: 'seedream',
    aiPhotoshopStyle: 'artistic',
    aiPhotoshopSize: undefined,
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: 'image_upload',
    awaitingAiPhotoshopImage: true,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: []
  },
  custom_prompt: {
    aiPhotoshopModel: 'seedream',
    aiPhotoshopStyle: 'custom',
    aiPhotoshopSize: undefined,
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: 'custom_prompt',
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: true,
    morphingImages: []
  },
  ready_to_process: {
    aiPhotoshopModel: 'seedream',
    aiPhotoshopStyle: 'artistic',
    aiPhotoshopSize: '1K',
    aiPhotoshopPrompt: 'enhance this image',
    aiPhotoshopStep: 'processing',
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: MOCK_IMAGES.buffer_images
  }
}

export const MOCK_FILE_FORMATS = {
  supported: [
    { extension: 'jpg', mimeType: 'image/jpeg', example: 'photo.jpg' },
    { extension: 'jpeg', mimeType: 'image/jpeg', example: 'image.jpeg' },
    { extension: 'png', mimeType: 'image/png', example: 'logo.png' },
    { extension: 'webp', mimeType: 'image/webp', example: 'modern.webp' },
    { extension: 'heic', mimeType: 'image/heic', example: 'IMG_001.HEIC' },
    { extension: 'heif', mimeType: 'image/heif', example: 'photo.heif' }
  ],
  unsupported: [
    { extension: 'gif', mimeType: 'image/gif', example: 'animation.gif' },
    { extension: 'bmp', mimeType: 'image/bmp', example: 'bitmap.bmp' },
    { extension: 'tiff', mimeType: 'image/tiff', example: 'scan.tiff' },
    { extension: 'svg', mimeType: 'image/svg+xml', example: 'vector.svg' }
  ]
}

export const MOCK_ERROR_SCENARIOS = {
  network_errors: [
    'Network timeout',
    'Connection refused',
    'DNS resolution failed',
    'SSL certificate error'
  ],
  file_errors: [
    'File too large',
    'Invalid file format',
    'Corrupted image data',
    'Missing file extension'
  ],
  validation_errors: [
    'Prompt too short',
    'Prompt too long',
    'Invalid size parameter',
    'Too many images'
  ],
  api_errors: [
    'API rate limit exceeded',
    'Invalid API key',
    'Service unavailable',
    'Processing timeout'
  ]
}

export const MOCK_PERFORMANCE_METRICS = {
  processing_times: {
    '1K_single': 30000, // 30 seconds
    '1K_multi_2': 55000, // 55 seconds
    '1K_multi_5': 120000, // 2 minutes
    '2K_single': 45000, // 45 seconds
    '2K_multi_2': 80000, // 1.3 minutes
    '4K_single': 90000, // 1.5 minutes
    '4K_multi_2': 160000 // 2.7 minutes
  },
  memory_usage: {
    '1K_single': 50 * 1024 * 1024, // 50MB
    '1K_multi_2': 85 * 1024 * 1024, // 85MB
    '2K_single': 80 * 1024 * 1024, // 80MB
    '4K_single': 200 * 1024 * 1024 // 200MB
  }
}

export const MOCK_TELEGRAM_RESPONSES = {
  photo_message: {
    message_id: 1001,
    from: MOCK_USER_DATA,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 123456789, type: 'private' },
    photo: [
      { file_id: 'photo_1_small', width: 90, height: 135 },
      { file_id: 'photo_1_medium', width: 320, height: 480 },
      { file_id: 'photo_1_large', width: 1024, height: 1536 }
    ],
    media_group_id: 'group_001'
  },
  text_message: {
    message_id: 1002,
    from: MOCK_USER_DATA,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 123456789, type: 'private' },
    text: 'merge these images together'
  },
  callback_query: {
    id: 'callback_001',
    from: MOCK_USER_DATA,
    message: {
      message_id: 1003,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123456789, type: 'private' }
    },
    data: 'ai_photoshop_model_seedream'
  }
}

export const MOCK_API_RESPONSES = {
  seedream_success: {
    images: [
      'https://api.example.com/result1.jpg',
      'https://api.example.com/result2.jpg'
    ],
    metadata: {
      prompt: 'enhance this image',
      size: '1K',
      dimensions: { width: 1024, height: 1536 },
      generation_time: 25.5,
      model_version: 'seedream-4.0'
    }
  },
  nano_banana_success: {
    success: true,
    result_url: 'https://api.example.com/nano_result.jpg',
    processing_time: 18.2
  },
  flux_max_success: {
    image: 'https://api.example.com/flux_result.png',
    metadata: {
      model: 'flux-kontext-max',
      processing_time: 12.8
    }
  },
  api_error: {
    error: 'Processing failed',
    code: 'PROCESSING_ERROR',
    details: 'Insufficient server resources'
  }
}

export const MOCK_COST_CALCULATIONS = [
  { size: '1K', images: 1, expected: 15 },
  { size: '1K', images: 2, expected: 30 },
  { size: '1K', images: 5, expected: 75 },
  { size: '2K', images: 1, expected: 20 },
  { size: '2K', images: 3, expected: 60 },
  { size: '4K', images: 1, expected: 30 },
  { size: '4K', images: 2, expected: 60 },
  { size: '4K', images: 5, expected: 150 }
]

export const MOCK_PROGRESS_MESSAGES = {
  collection: [
    '📸 [▓░░░░░░░░░] 1 фото',
    '📸 [▓▓░░░░░░░░] 2 фото',
    '📸 [▓▓▓░░░░░░░] 3 фото',
    '📸 [▓▓▓▓▓░░░░░] 5 фото',
    '📸 [▓▓▓▓▓▓▓▓░░] 8 фото',
    '📸 [▓▓▓▓▓▓▓▓▓▓] 10 фото'
  ],
  processing: [
    '⏳ Загрузка изображений...',
    '🎨 Обработка изображений...',
    '✨ Применение эффектов...',
    '🔄 Финальная обработка...',
    '✅ Готово!'
  ]
}

/**
 * Helper function to create mock context with specific state
 */
export function createMockContext(sessionState: any = MOCK_SESSION_STATES.initial): any {
  return {
    from: MOCK_USER_DATA,
    chat: { id: parseInt(MOCK_USER_DATA.telegram_id), type: 'private' },
    session: { ...sessionState },
    telegram: {
      getFile: jest.fn(),
      getFileLink: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn()
    },
    reply: jest.fn(),
    editMessageText: jest.fn(),
    deleteMessage: jest.fn(),
    answerCbQuery: jest.fn(),
    scene: {
      enter: jest.fn(),
      leave: jest.fn(),
      reenter: jest.fn()
    }
  }
}

/**
 * Helper function to create mock file with specific properties
 */
export function createMockFile(
  filename: string,
  mimeType: string,
  size: number,
  width: number = 1024,
  height: number = 1536
) {
  return {
    filename,
    mimeType,
    size,
    width,
    height,
    url: `https://example.com/${filename}`,
    buffer: Buffer.from(`mock-${filename}-data`)
  }
}

/**
 * Helper function to validate session state transitions
 */
export function validateSessionTransition(fromState: any, toState: any, expectedChanges: string[]): boolean {
  for (const key of expectedChanges) {
    if (fromState[key] === toState[key]) {
      console.warn(`Expected change in ${key} but values are the same`)
      return false
    }
  }
  return true
}