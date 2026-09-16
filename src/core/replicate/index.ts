import { secretFingerprint } from '@/utils/secretFingerprint'

const Replicate = require('replicate')

// ✅ ЛЕНИВАЯ ИНИЦИАЛИЗАЦИЯ: клиент создается при первом вызове
// Это гарантирует, что секреты из Infisical уже загружены в process.env
let _replicateClient: any = null

function getReplicateClient() {
  if (!_replicateClient) {
    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      throw new Error(
        '❌ CRITICAL: REPLICATE_API_TOKEN not found in process.env. Make sure secrets are loaded from Infisical!'
      )
    }
    _replicateClient = new Replicate({
      auth: token,
    })
    console.log(
      '✅ [REPLICATE] Client initialized with token:',
      `${secretFingerprint(token)} (${token.length} chars)`
    )
  }
  return _replicateClient
}

// A generous BACKSTOP so replicate.run can never hang forever. client.run polls
// the prediction until it settles; a prediction stuck in starting/processing
// polls indefinitely, and many callers charge the user BEFORE this await, so an
// infinite hang strands the payment (the refund lives in their catch and is
// unreachable without a throw). 15 min is far above every real replicate.run
// here -- image models finish in seconds, the longest video models (minimax /
// haiper / kling-lip-sync) in a few minutes -- so this is transparent to legit
// runs and only fires on a true hang, throwing into each caller's existing
// error/refund path. Training uses a different API (replicate.trainings), not
// this .run, so it is unaffected. Per-service timeouts (e.g. generateFluxKontext
// 60s) stay tighter and still win the race. Overridable via env.
const REPLICATE_RUN_TIMEOUT_MS =
  Number(process.env.REPLICATE_RUN_TIMEOUT_MS) || 15 * 60 * 1000

// Экспортируем функцию вместо объекта для ленивой инициализации
export const replicate = {
  run: async (...args: any[]) => {
    const client = getReplicateClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        client.run(...args),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `replicate.run timed out after ${REPLICATE_RUN_TIMEOUT_MS}ms (model ${args[0]})`
                )
              ),
            REPLICATE_RUN_TIMEOUT_MS
          )
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  },
}

export const modelPricing: Record<string, string> = {
  'black-forest-labs/flux-1.1-pro': '$0.040 / image',
  'black-forest-labs/flux-1.1-pro-ultra': '$0.060 / image',
  'black-forest-labs/flux-canny-dev': '$0.025 / image',
  'black-forest-labs/flux-canny-pro': '$0.050 / image',
  'black-forest-labs/flux-depth-dev': '$0.025 / image',
  'black-forest-labs/flux-depth-pro': '$0.050 / image',
  'black-forest-labs/flux-dev': '$0.025 / image',
  'black-forest-labs/flux-dev-lora': '$0.032 / image',
  'black-forest-labs/flux-fill-dev': '$0.040 / image',
  'black-forest-labs/flux-fill-pro': '$0.050 / image',
  'black-forest-labs/flux-pro': '$0.055 / image',
  'black-forest-labs/flux-redux-dev': '$0.025 / image',
  'black-forest-labs/flux-redux-schnell': '$0.003 / image',
  'black-forest-labs/flux-schnell': '$0.003 / image',
  'black-forest-labs/flux-schnell-lora': '$0.020 / image',
  'ideogram-ai/ideogram-v2': '$0.080 / image',
  'ideogram-ai/ideogram-v2-turbo': '$0.050 / image',
  'luma/photon': '$0.030 / image',
  'luma/photon-flash': '$0.010 / image',
  'recraft-ai/recraft-20b': '$0.022 / image',
  'recraft-ai/recraft-20b-svg': '$0.044 / image',
  'recraft-ai/recraft-v3': '$0.040 / image',
  'recraft-ai/recraft-v3-svg': '$0.080 / image',
  'stability-ai/stable-diffusion-3': '$0.035 / image',
  'stability-ai/stable-diffusion-3.5-large': '$0.065 / image',
  'stability-ai/stable-diffusion-3.5-large-turbo': '$0.040 / image',
  'stability-ai/stable-diffusion-3.5-medium': '$0.035 / image',
  'bytedance/seedance-1-pro': '$0.03 / second (480p), $0.15 / second (1080p)',
}

interface ModelConfig {
  key: string
  word: string
  description: {
    ru: string
    en: string
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getInput: (prompt: string, aspect_ratio?: string) => Record<string, any>
  price: number
}

const getInput = (prompt: string, aspect_ratio: string) => {
  console.log(aspect_ratio, 'getInput aspect_ratio')
  let width: number, height: number

  switch (aspect_ratio) {
    case '1:1':
      width = 1024
      height = 1024
      break
    case '16:9':
      width = 1368
      height = 768
      break
    case '9:16':
      width = 768
      height = 1368
      break
    default:
      width = 1368
      height = 1024
      break
  }

  return {
    prompt,
    aspect_ratio,
    width,
    height,
    negative_prompt:
      'nsfw, erotic, violence, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
  }
}
export const models: Record<string, ModelConfig> = {
  flux: {
    key: 'black-forest-labs/flux-1.1-pro-ultra',
    word: 'ultra realistic photograph, 8k uhd, high quality',
    description: {
      ru: '🎨 Flux - фотореалистичные изображения высокого качества',
      en: '🎨 Flux - photorealistic high quality images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.06,
  },
  sdxl: {
    key: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    word: 'ultra realistic photograph, 8k uhd, high quality',
    description: {
      ru: '🎨 SDXL - фотореалистичные изображения высокого качества',
      en: '🎨 SDXL - photorealistic high quality images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.04,
  },
  sd3: {
    key: 'stability-ai/stable-diffusion-3.5-large-turbo',
    word: '',
    description: {
      ru: '🎨 SD3 - фотореалистичные изображения высокого качества',
      en: '🎨 SD3 - photorealistic high quality images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.04,
  },
  recraft: {
    key: 'recraft-ai/recraft-v3',
    word: '',
    description: {
      ru: '🎨 Recraft - фотореалистичные изображения высокого качества',
      en: '🎨 Recraft - photorealistic high quality images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.022,
  },
  photon: {
    key: 'luma/photon',
    word: '',
    description: {
      ru: '🎨 Photon - фотореалистичные изображения высокого качества',
      en: '🎨 Photon - photorealistic high quality images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.03,
  },
  lee_solar: {
    key: 'ghashtag/lee_solar:7b7e9744c88e23c0eeccb9874c36336f73fce9d3d17992c8acabb04e67ee03b4',
    word: '',
    description: {
      ru: '🎨 Lee Solar - астрологические изображения',
      en: '🎨 Lee Solar - astrological images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.022,
  },
  dpbelarusx: {
    key: 'dpbelarusx/dpbelarusx:7b7e9744c88e23c0eeccb9874c36336f73fce9d3d17992c8acabb04e67ee03b4',
    word: '',
    description: {
      ru: '🎨 DPBelarusX - астрологические изображения',
      en: '🎨 DPBelarusX - astrological images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.022,
  },
  neuro_coder: {
    key: 'ghashtag/neuro_sage:65d4aa45988460fc1966dddd91245f7838161a0eec9847ac783fd1918b704033',
    word: 'NEURO_SAGE',
    description: {
      ru: '🎨 NeuroCoder - астрологические изображения',
      en: '🎨 NeuroCoder - astrological images',
    },
    getInput: (prompt, aspect_ratio) =>
      getInput(prompt, aspect_ratio || '16:9'),
    price: 0.022,
  },
}
