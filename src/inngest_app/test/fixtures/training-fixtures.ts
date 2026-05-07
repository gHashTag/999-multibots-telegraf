/**
 * TRAINING FUNCTIONS FIXTURES
 *
 * Тестовые данные для training функций:
 * - modelTrainingV2
 * - morphImages
 */

export const modelTrainingV2Data = {
  valid_basic: {
    telegram_id: '123456789',
    model_name: 'my_custom_model',
    images: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
      'https://example.com/image3.jpg',
    ],
    training_type: 'face_model',
    epochs: 10,
  },

  valid_advanced: {
    telegram_id: '123456789',
    model_name: 'advanced_model',
    images: [
      'https://example.com/img1.jpg',
      'https://example.com/img2.jpg',
      'https://example.com/img3.jpg',
      'https://example.com/img4.jpg',
      'https://example.com/img5.jpg',
    ],
    training_type: 'style_model',
    epochs: 50,
    learning_rate: 0.001,
    batch_size: 4,
    validation_split: 0.2,
  },

  invalid_insufficient_images: {
    telegram_id: '123456789',
    model_name: 'invalid_model',
    images: ['https://example.com/image1.jpg'],
    training_type: 'face_model',
  },

  invalid_missing_model_name: {
    telegram_id: '123456789',
    images: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    training_type: 'face_model',
  },
}

export const morphImagesData = {
  valid_simple: {
    telegram_id: '123456789',
    source_image: 'https://example.com/source.jpg',
    target_image: 'https://example.com/target.jpg',
    steps: 20,
    duration: 3,
  },

  valid_advanced: {
    telegram_id: '123456789',
    source_image: 'https://example.com/source.jpg',
    target_image: 'https://example.com/target.jpg',
    steps: 50,
    duration: 5,
    quality: 'high',
    output_format: 'mp4',
    fps: 30,
  },

  invalid_images: {
    telegram_id: '123456789',
    source_image: '',
    target_image: 'https://example.com/target.jpg',
  },
}

export const trainingExpectedResults = {
  success_training_queued: {
    success: true,
    model_id: 'model_123',
    status: 'training_queued',
    estimated_time: 3600,
    message: 'Training started',
  },

  success_morph: {
    success: true,
    video_url: 'https://example.com/morph.mp4',
    duration: 3,
    steps: 20,
  },

  error_insufficient_images: {
    success: false,
    error: 'Need at least 3 images for training',
  },
}

export const trainingErrors = {
  insufficient_images: {
    code: 'INSUFFICIENT_IMAGES',
    message: 'Недостаточно изображений для обучения',
  },

  invalid_image_format: {
    code: 'INVALID_IMAGE_FORMAT',
    message: 'Недопустимый формат изображения',
  },

  training_failed: {
    code: 'TRAINING_FAILED',
    message: 'Ошибка обучения модели',
  },

  model_not_found: {
    code: 'MODEL_NOT_FOUND',
    message: 'Модель не найдена',
  },

  morph_failed: {
    code: 'MORPH_FAILED',
    message: 'Ошибка создания морфинга',
  },
}
