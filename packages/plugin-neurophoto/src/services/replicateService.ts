/**
 * @999-agents/plugin-neurophoto - Replicate Service
 * Handles AI image generation via Replicate API
 */

import { Service, IAgentRuntime } from '@elizaos/core';
import Replicate from 'replicate';
import type {
  GenerateImageOptions,
  ImageGenerationResult,
  ReplicateServiceConfig,
} from '../types/index.js';
import { DEFAULT_MODELS } from '../types/index.js';

export class ReplicateService extends Service {
  static serviceType = 'replicate';

  private client: Replicate | null = null;
  private serviceConfig: ReplicateServiceConfig | null = null;

  capabilityDescription = 'AI image generation using Replicate API with Flux and SDXL models';

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const apiKey = runtime.getSetting('REPLICATE_API_KEY');

    if (!apiKey) {
      throw new Error(
        'REPLICATE_API_KEY не найден в настройках. Добавьте его в .env или settings'
      );
    }

    this.serviceConfig = {
      apiKey,
      defaultModel: runtime.getSetting('DEFAULT_MODEL') || DEFAULT_MODELS.FLUX_SCHNELL,
      timeout: Number(runtime.getSetting('REPLICATE_TIMEOUT')) || 300000, // 5 min
      maxRetries: Number(runtime.getSetting('REPLICATE_MAX_RETRIES')) || 3,
    };

    this.client = new Replicate({ auth: this.serviceConfig.apiKey });

    console.log('✅ Replicate Service initialized');
    console.log(`📝 Default model: ${this.serviceConfig.defaultModel}`);
  }

  async start(): Promise<void> {
    // Service is ready after initialization
    console.log('🚀 Replicate Service started');
  }

  async stop(): Promise<void> {
    // Cleanup if needed
    this.client = null;
    console.log('🛑 Replicate Service stopped');
  }

  /**
   * Generate AI images using Replicate
   */
  async generateImage(
    options: GenerateImageOptions
  ): Promise<ImageGenerationResult> {
    if (!this.client) {
      throw new Error('Replicate Service не инициализирован');
    }

    const startTime = Date.now();

    try {
      const modelUrl = options.modelUrl || this.serviceConfig!.defaultModel!;
      const numImages = Math.min(options.numImages || 1, 4); // Max 4 images

      console.log('🎨 Starting image generation...');
      console.log(`📝 Prompt: ${options.prompt}`);
      console.log(`🤖 Model: ${modelUrl}`);
      console.log(`🔢 Count: ${numImages}`);

      // Prepare input for Replicate
      const input: any = {
        prompt: options.prompt,
        num_outputs: numImages,
      };

      // Add optional parameters
      if (options.aspectRatio) {
        input.aspect_ratio = options.aspectRatio;
      }

      if (options.negativePrompt) {
        input.negative_prompt = options.negativePrompt;
      }

      if (options.steps) {
        input.num_inference_steps = options.steps;
      }

      if (options.guidanceScale) {
        input.guidance_scale = options.guidanceScale;
      }

      if (options.seed) {
        input.seed = options.seed;
      }

      // Run generation
      const output = await this.client.run(modelUrl as any, { input });

      const generationTime = Date.now() - startTime;

      // Parse output URLs
      let imageUrls: string[];
      if (Array.isArray(output)) {
        imageUrls = output.filter((url) => typeof url === 'string');
      } else if (typeof output === 'string') {
        imageUrls = [output];
      } else if (output && typeof output === 'object' && 'output' in output) {
        const outputData = (output as any).output;
        imageUrls = Array.isArray(outputData) ? outputData : [outputData];
      } else {
        console.error('❌ Unexpected output format:', output);
        throw new Error('Неожиданный формат ответа от Replicate');
      }

      console.log(`✅ Generation complete in ${generationTime}ms`);
      console.log(`📸 Generated ${imageUrls.length} images`);

      return {
        success: true,
        imageUrls,
        metadata: {
          prompt: options.prompt,
          model: modelUrl,
          generationTime,
        },
      };
    } catch (error) {
      const generationTime = Date.now() - startTime;
      console.error('❌ Image generation failed:', error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Неизвестная ошибка при генерации',
        metadata: {
          prompt: options.prompt,
          model: options.modelUrl || this.serviceConfig!.defaultModel!,
          generationTime,
        },
      };
    }
  }

  /**
   * Check if a model URL is valid
   */
  async validateModel(modelUrl: string): Promise<boolean> {
    try {
      if (!this.client) {
        throw new Error('Replicate Service не инициализирован');
      }

      // Parse model URL (format: "owner/name" or "owner/name:version")
      const parts = modelUrl.split(':')[0].split('/');
      if (parts.length !== 2) {
        console.error(`❌ Invalid model URL format: ${modelUrl}`);
        return false;
      }

      const [owner, name] = parts;

      // Try to get model info
      await this.client.models.get(owner, name);
      return true;
    } catch (error) {
      console.error(`❌ Invalid model: ${modelUrl}`, error);
      return false;
    }
  }

  /**
   * Get default model URL
   */
  getDefaultModel(): string {
    return this.serviceConfig?.defaultModel || DEFAULT_MODELS.FLUX_SCHNELL;
  }
}
