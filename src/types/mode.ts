export enum ModeEnum {
  TopUpBalance = 'top_up_balance',
  TextToImage = 'text_to_image',
  TextToVideo = 'text_to_video',
  TextToAudio = 'text_to_audio',
  TextToCode = 'text_to_code',
  TextToText = 'text_to_text',
  ImageToImage = 'image_to_image',
  ImageToText = 'image_to_text',
  ImageToVideo = 'image_to_video',
  VideoToText = 'video_to_text',
  AudioToText = 'audio_to_text',
  CodeToText = 'code_to_text',
  CodeToCode = 'code_to_code',
}

export interface Mode {
  name: string
  description: string
  type: ModeEnum
  price: number
  stars: number
  enabled: boolean
}

export const MODES: Record<ModeEnum, Mode> = {
  [ModeEnum.TopUpBalance]: {
    name: 'Пополнение баланса',
    description: 'Пополнить баланс звезд',
    type: ModeEnum.TopUpBalance,
    price: 0,
    stars: 0,
    enabled: true,
  },
  [ModeEnum.TextToImage]: {
    name: 'Текст в изображение',
    description: 'Создать изображение из текстового описания',
    type: ModeEnum.TextToImage,
    price: 10,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.TextToVideo]: {
    name: 'Текст в видео',
    description: 'Создать видео из текстового описания',
    type: ModeEnum.TextToVideo,
    price: 20,
    stars: 2,
    enabled: true,
  },
  [ModeEnum.TextToAudio]: {
    name: 'Текст в аудио',
    description: 'Создать аудио из текста',
    type: ModeEnum.TextToAudio,
    price: 15,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.TextToCode]: {
    name: 'Текст в код',
    description: 'Сгенерировать код из текстового описания',
    type: ModeEnum.TextToCode,
    price: 25,
    stars: 2,
    enabled: true,
  },
  [ModeEnum.TextToText]: {
    name: 'Текст в текст',
    description: 'Обработать или сгенерировать текст',
    type: ModeEnum.TextToText,
    price: 5,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.ImageToImage]: {
    name: 'Изображение в изображение',
    description: 'Преобразовать или улучшить изображение',
    type: ModeEnum.ImageToImage,
    price: 15,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.ImageToText]: {
    name: 'Изображение в текст',
    description: 'Распознать текст на изображении',
    type: ModeEnum.ImageToText,
    price: 10,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.ImageToVideo]: {
    name: 'Изображение в видео',
    description: 'Создать видео из изображения',
    type: ModeEnum.ImageToVideo,
    price: 25,
    stars: 2,
    enabled: true,
  },
  [ModeEnum.VideoToText]: {
    name: 'Видео в текст',
    description: 'Распознать текст из видео',
    type: ModeEnum.VideoToText,
    price: 20,
    stars: 2,
    enabled: true,
  },
  [ModeEnum.AudioToText]: {
    name: 'Аудио в текст',
    description: 'Распознать текст из аудио',
    type: ModeEnum.AudioToText,
    price: 15,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.CodeToText]: {
    name: 'Код в текст',
    description: 'Объяснить код на естественном языке',
    type: ModeEnum.CodeToText,
    price: 15,
    stars: 1,
    enabled: true,
  },
  [ModeEnum.CodeToCode]: {
    name: 'Код в код',
    description: 'Преобразовать или улучшить код',
    type: ModeEnum.CodeToCode,
    price: 20,
    stars: 2,
    enabled: true,
  },
}
