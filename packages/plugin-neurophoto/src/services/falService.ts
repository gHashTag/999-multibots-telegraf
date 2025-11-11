/**
 * @999-agents/plugin-neurophoto - Fal.ai Service
 * Handles AI image generation via Fal.ai API with LoRA support
 */

import { Service, IAgentRuntime } from '@elizaos/core';
import { fal } from '@fal-ai/client';
import type {
  GenerateImageOptions,
  ImageGenerationResult,
  FalServiceConfig,
  LoRAConfig,
} from '../types/index.js';

export class FalService extends Service {
  static serviceType = 'fal';

  private serviceConfig: FalServiceConfig | null = null;

  capabilityDescription = 'AI image generation using Fal.ai API with Flux models and LoRA support';

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const apiKey = runtime.getSetting('FAL_KEY');

    if (!apiKey) {
      throw new Error(
        'FAL_KEY не найден в настройках. Добавьте его в .env или settings'
      );
    }

    // Configure fal client
    fal.config({
      credentials: apiKey,
    });

    this.serviceConfig = {
      apiKey,
      defaultModel: runtime.getSetting('FAL_DEFAULT_MODEL') || 'fal-ai/flux-lora',
      defaultLoRA: {
        path: runtime.getSetting('FAL_DEFAULT_LORA_PATH') ||
              'https://v3b.fal.media/files/b/elephant/YpfnIK7JlNO7vZTsGanfo_pytorch_lora_weights.safetensors',
        scale: Number(runtime.getSetting('FAL_DEFAULT_LORA_SCALE')) || 1.0,
        triggerWord: runtime.getSetting('FAL_LORA_TRIGGER') || 'NEURO_SAGE',
      },
      timeout: Number(runtime.getSetting('FAL_TIMEOUT')) || 300000, // 5 min
      maxRetries: Number(runtime.getSetting('FAL_MAX_RETRIES')) || 3,
    };

    console.log('✅ Fal.ai Service initialized');
    console.log(`📝 Default model: ${this.serviceConfig.defaultModel}`);
    console.log(`🎨 Default LoRA: ${this.serviceConfig.defaultLoRA?.triggerWord}`);
  }

  async start(): Promise<void> {
    console.log('🚀 Fal.ai Service started');
  }

  async stop(): Promise<void> {
    console.log('🛑 Fal.ai Service stopped');
  }

  /**
   * Generate AI images using Fal.ai with LoRA
   */
  async generateImage(
    options: GenerateImageOptions
  ): Promise<ImageGenerationResult> {
    if (!this.serviceConfig) {
      throw new Error('Fal.ai Service не инициализирован');
    }

    const startTime = Date.now();

    try {
      const modelId = options.modelUrl || this.serviceConfig.defaultModel!;

      console.log('🎨 Starting Fal.ai image generation...');
      console.log(`📝 Prompt: ${options.prompt}`);
      console.log(`🤖 Model: ${modelId}`);

      // Add trigger word if using LoRA
      let enhancedPrompt = options.prompt;
      if (this.serviceConfig.defaultLoRA) {
        const { triggerWord } = this.serviceConfig.defaultLoRA;
        // Add trigger word at the beginning
        enhancedPrompt = `${triggerWord} ${options.prompt}`;
        console.log(`✨ Enhanced prompt with trigger: ${enhancedPrompt}`);
      }

      // Prepare input for Fal.ai
      const input: any = {
        prompt: enhancedPrompt,
        image_size: {
          width: 768,   // 9:16 ratio
          height: 1365, // 9:16 ratio
        },
        num_images: options.numImages || 1,
      };

      // Add LoRA if configured
      if (this.serviceConfig.defaultLoRA) {
        input.loras = [
          {
            path: this.serviceConfig.defaultLoRA.path,
            scale: this.serviceConfig.defaultLoRA.scale,
          },
        ];
        console.log(`🎭 Using LoRA: ${this.serviceConfig.defaultLoRA.path}`);
        console.log(`⚖️  LoRA scale: ${this.serviceConfig.defaultLoRA.scale}`);
      }

      // Add optional parameters
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

      console.log('📤 Sending request to Fal.ai...');

      // Call Fal.ai API
      const result = await fal.subscribe(modelId, {
        input,
        logs: false,
      });

      const generationTime = Date.now() - startTime;

      // Parse output
      const output = result as any;
      let imageUrls: string[] = [];

      if (output.images && Array.isArray(output.images)) {
        imageUrls = output.images.map((img: any) => img.url);
      } else if (output.image_url) {
        imageUrls = [output.image_url];
      } else if (output.url) {
        imageUrls = [output.url];
      } else {
        console.error('❌ Unexpected output format:', output);
        throw new Error('Неожиданный формат ответа от Fal.ai');
      }

      console.log(`✅ Generation complete in ${generationTime}ms`);
      console.log(`📸 Generated ${imageUrls.length} images`);

      return {
        success: true,
        imageUrls,
        metadata: {
          prompt: enhancedPrompt,
          model: modelId,
          generationTime,
          loraUsed: this.serviceConfig.defaultLoRA?.path,
          triggerWord: this.serviceConfig.defaultLoRA?.triggerWord,
        },
      };
    } catch (error) {
      const generationTime = Date.now() - startTime;
      console.error('❌ Fal.ai image generation failed:', error);

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
   * Get default LoRA configuration
   */
  getDefaultLoRA(): LoRAConfig | undefined {
    return this.serviceConfig?.defaultLoRA;
  }
}
