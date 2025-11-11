/**
 * @999-agents/plugin-neurophoto - TypeScript Types
 * ElizaOS plugin for AI image generation
 */

export interface GenerateImageOptions {
  /** Text prompt for image generation */
  prompt: string;

  /** Replicate model URL (e.g., "black-forest-labs/flux-schnell") */
  modelUrl?: string;

  /** Number of images to generate (1-4) */
  numImages?: number;

  /** Image aspect ratio */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';

  /** Negative prompt (what to avoid in the image) */
  negativePrompt?: string;

  /** Image quality/steps (higher = better quality but slower) */
  steps?: number;

  /** Guidance scale (how closely to follow the prompt) */
  guidanceScale?: number;

  /** Random seed for reproducibility */
  seed?: number;
}

export interface ImageGenerationResult {
  /** Whether generation was successful */
  success: boolean;

  /** Array of generated image URLs */
  imageUrls?: string[];

  /** Error message if failed */
  error?: string;

  /** Additional metadata about generation */
  metadata?: {
    prompt: string;
    model: string;
    generationTime?: number;
    cost?: number;
    requestId?: string;
  };
}

export interface ReplicateModel {
  /** Model unique identifier */
  id: string;

  /** Human-readable model name */
  name: string;

  /** Full Replicate model URL */
  url: string;

  /** Model description */
  description?: string;

  /** Whether this is a custom user-trained model */
  isCustom: boolean;

  /** Model version/hash */
  version?: string;

  /** Estimated generation time in seconds */
  estimatedTime?: number;

  /** Cost per generation in credits */
  cost?: number;
}

export interface ReplicateServiceConfig {
  /** Replicate API key */
  apiKey: string;

  /** Default model to use */
  defaultModel?: string;

  /** Timeout for generation requests (ms) */
  timeout?: number;

  /** Max retries on failure */
  maxRetries?: number;
}

export interface PluginSettings {
  REPLICATE_API_KEY: string;
  DEFAULT_MODEL?: string;
  MAX_IMAGES?: number;
  ENABLE_CUSTOM_MODELS?: boolean;
}

/**
 * Supported Replicate Models (Popular ones)
 */
export const DEFAULT_MODELS = {
  /** Fast, high-quality image generation */
  FLUX_SCHNELL: 'black-forest-labs/flux-schnell',

  /** High-detail image generation */
  FLUX_PRO: 'black-forest-labs/flux-pro',

  /** General-purpose SDXL */
  SDXL: 'stability-ai/sdxl:latest',

  /** Realistic photography */
  REALISTIC_VISION: 'playgroundai/playground-v2.5-1024px-aesthetic',
} as const;

export type ModelPreset = keyof typeof DEFAULT_MODELS;
