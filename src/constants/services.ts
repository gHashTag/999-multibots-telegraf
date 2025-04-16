import { ServiceConfig, ServiceType } from '../interfaces/service.interface'

export const DEFAULT_BASE_COST = 10

export const SERVICE_CONFIGS: Record<ServiceType, ServiceConfig> = {
  TextToImage: {
    name: 'Text to Image',
    type: 'TextToImage',
    description: 'Generate images from text descriptions',
    baseCost: 20,
    enabled: true,
    metadata: {
      maxTokens: 1000,
      supportedFormats: ['png', 'jpg'],
    },
  },
  TextToVideo: {
    name: 'Text to Video',
    type: 'TextToVideo',
    description: 'Generate videos from text descriptions',
    baseCost: 50,
    enabled: true,
    metadata: {
      maxDuration: 60,
      supportedFormats: ['mp4'],
    },
  },
  ImageToVideo: {
    name: 'Image to Video',
    type: 'ImageToVideo',
    description: 'Convert images to video animations',
    baseCost: 30,
    enabled: true,
    metadata: {
      maxImages: 10,
      supportedFormats: ['mp4'],
    },
  },
  TextToSpeech: {
    name: 'Text to Speech',
    type: 'TextToSpeech',
    description: 'Convert text to natural speech',
    baseCost: 15,
    enabled: true,
    metadata: {
      voices: ['male', 'female'],
      languages: ['en', 'ru'],
    },
  },
  SpeechToText: {
    name: 'Speech to Text',
    type: 'SpeechToText',
    description: 'Transcribe speech to text',
    baseCost: 15,
    enabled: true,
    metadata: {
      maxDuration: 300,
      languages: ['en', 'ru'],
    },
  },
  Translation: {
    name: 'Translation',
    type: 'Translation',
    description: 'Translate text between languages',
    baseCost: 10,
    enabled: true,
    metadata: {
      languages: ['en', 'ru', 'es', 'fr', 'de'],
    },
  },
  TopUpBalance: {
    name: 'Top Up Balance',
    type: 'TopUpBalance',
    description: 'Add funds to your account',
    baseCost: 0,
    enabled: true,
  },
  Subscription: {
    name: 'Subscription',
    type: 'Subscription',
    description: 'Subscribe to premium features',
    baseCost: 100,
    enabled: true,
    metadata: {
      duration: 30, // days
      features: ['priority_access', 'discounts'],
    },
  },
  Other: {
    name: 'Other Services',
    type: 'Other',
    description: 'Miscellaneous services',
    baseCost: DEFAULT_BASE_COST,
    enabled: true,
  },
}

export const getServiceConfig = (type: ServiceType): ServiceConfig => {
  return SERVICE_CONFIGS[type] || SERVICE_CONFIGS.Other
}

export const calculateServiceCost = (
  type: ServiceType,
  quantity: number = 1,
  options: {
    discountPercent?: number
    minimumCost?: number
    maximumCost?: number
  } = {}
): number => {
  const config = getServiceConfig(type)
  const baseCost = config.baseCost * quantity

  if (!options.discountPercent) {
    return baseCost
  }

  const discountedCost = baseCost * (1 - options.discountPercent / 100)

  if (options.minimumCost && discountedCost < options.minimumCost) {
    return options.minimumCost
  }

  if (options.maximumCost && discountedCost > options.maximumCost) {
    return options.maximumCost
  }

  return discountedCost
}
