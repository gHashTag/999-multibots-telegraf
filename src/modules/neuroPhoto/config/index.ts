/**
 * Configuration for NeuroPhoto module.
 * Defines models, costs, and other settings for image generation.
 */

// Default model for image generation
export const DEFAULT_MODEL_URL = 'stability-ai/stable-diffusion'

// Cost per image generation (placeholder)
export const COST_PER_IMAGE = 10

// Maximum number of images that can be generated in one request
export const MAX_IMAGES_PER_REQUEST = 5

// Supported models (placeholder)
export const SUPPORTED_MODELS = {
  'stability-ai/stable-diffusion': {
    name: 'Stable Diffusion',
    costMultiplier: 1.0,
  },
  'openai/dall-e': {
    name: 'DALL-E',
    costMultiplier: 1.5,
  },
}
