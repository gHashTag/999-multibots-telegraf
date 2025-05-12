export const NEURO_PHOTO_MODELS = {
  V1: {
    name: 'Model V1',
    costPerImage: 10,
    defaultParams: {
      width: 512,
      height: 512,
      numImages: 1,
    },
  },
  V2: {
    name: 'Model V2',
    costPerImage: 15,
    defaultParams: {
      width: 1024,
      height: 1024,
      numImages: 1,
      scheduler: 'default',
      guidanceScale: 7.5,
      numInferenceSteps: 50,
    },
  },
}

export const NSFW_ERROR_MESSAGE =
  'NSFW content detected. Please adjust your request.'
