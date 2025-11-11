/**
 * @999-agents/plugin-neurophoto - Generate Image Action
 * ElizaOS Action for AI image generation
 */

import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
} from '@elizaos/core';
import { ReplicateService } from '../services/replicateService.js';
import { FalService } from '../services/falService.js';
import type { GenerateImageOptions } from '../types/index.js';

export const generateImageAction: Action = {
  name: 'GENERATE_NEUROPHOTO',
  similes: [
    'MAKE_IMAGE',
    'CREATE_PHOTO',
    'NEUROPHOTO',
    'GENERATE_IMAGE',
    'AI_IMAGE',
    'DRAW_IMAGE',
  ],
  description: `Генерирует AI-изображения с помощью Flux/SDXL моделей.
Используй когда пользователь:
- Просит нарисовать/создать/сгенерировать изображение
- Хочет увидеть как что-то выглядит
- Спрашивает "покажи...", "сделай фото...", "нарисуй..."
- Использует команду /neurophoto
Не требует строгого формата команды - понимает естественный язык.`,

  /**
   * Validate if this action should run
   * Returns true if message looks like image generation request
   */
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase();

    if (!text) return false;

    // Direct command triggers (high priority)
    const commands = ['/neurophoto', 'нейрофото', 'neurophoto'];
    if (commands.some((cmd) => text.includes(cmd))) {
      return true;
    }

    // Intent-based triggers (natural language)
    const intents = [
      // Русский
      'нарисуй',
      'создай изображение',
      'сгенерируй',
      'сделай картинк',
      'хочу фото',
      'покажи как выглядит',
      'сделай фото',

      // English
      'generate image',
      'create image',
      'draw',
      'make a picture',
      'show me how',
      'can you draw',
      'make an image',
    ];

    return intents.some((intent) => text.includes(intent));
  },

  /**
   * Main handler for image generation
   */
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options,
    callback?: HandlerCallback
  ) => {
    try {
      console.log('🎨 [NEUROPHOTO] Starting image generation...');

      // Extract prompt from message
      const text = message.content?.text;

      if (!text) {
        console.error('❌ [NEUROPHOTO] No text in message');
        await callback?.({
          text: '❌ Не удалось получить текст сообщения.',
        });
        return {
          success: false,
          error: new Error('No text in message'),
        };
      }
      let prompt = text
        .replace(/\/neurophoto/gi, '')
        .replace(/\/generate/gi, '')
        .replace(/нейрофото/gi, '')
        .replace(/создай изображение/gi, '')
        .replace(/сгенерируй картинку/gi, '')
        .replace(/нарисуй/gi, '')
        .replace(/generate image/gi, '')
        .replace(/create image/gi, '')
        .replace(/draw/gi, '')
        .trim();

      // Validate prompt
      if (!prompt || prompt.length < 3) {
        console.log('❌ [NEUROPHOTO] Prompt too short');

        await callback?.({
          text: `❌ Пожалуйста, опишите какое изображение вы хотите создать.

**Примеры**:
• /neurophoto красивый закат над океаном
• /neurophoto футуристический город с летающими машинами
• /neurophoto портрет кота в космическом шлеме

Минимальная длина описания: 3 символа.`,
        });

        return {
          success: false,
          error: new Error('Промпт слишком короткий'),
        };
      }

      console.log(`📝 [NEUROPHOTO] Prompt: ${prompt}`);

      // Determine which provider to use
      const provider = runtime.getSetting('IMAGE_PROVIDER') || 'fal'; // Default to fal for LoRA support

      console.log(`🔌 [NEUROPHOTO] Using provider: ${provider}`);

      let service: ReplicateService | FalService;

      if (provider === 'fal') {
        const falService = runtime.getService<FalService>('fal');
        if (!falService) {
          console.error('❌ [NEUROPHOTO] Fal.ai service not found');

          await callback?.({
            text: '❌ Сервис генерации изображений Fal.ai недоступен. Проверьте настройки FAL_KEY.',
          });

          return {
            success: false,
            error: new Error('Fal.ai service not available'),
          };
        }
        service = falService;
      } else {
        const replicateService = runtime.getService<ReplicateService>('replicate');
        if (!replicateService) {
          console.error('❌ [NEUROPHOTO] Replicate service not found');

          await callback?.({
            text: '❌ Сервис генерации изображений Replicate недоступен. Проверьте настройки REPLICATE_API_KEY.',
          });

          return {
            success: false,
            error: new Error('Replicate service not available'),
          };
        }
        service = replicateService;
      }

      // Send "generating" message
      await callback?.({
        text: '🎨 Генерирую изображение, это займёт 10-30 секунд...',
      });

      // Prepare generation options
      const genOptions: GenerateImageOptions = {
        prompt,
        numImages: 1,
        aspectRatio: '9:16', // Default to vertical for social media
      };

      // Generate image
      const result = await service.generateImage(genOptions);

      if (!result.success || !result.imageUrls || result.imageUrls.length === 0) {
        console.error('❌ [NEUROPHOTO] Generation failed:', result.error);

        await callback?.({
          text: `❌ Не удалось сгенерировать изображение.

Ошибка: ${result.error || 'Неизвестная ошибка'}

Попробуйте:
• Упростить описание
• Использовать английский язык
• Попробовать позже`,
        });

        return {
          success: false,
          error: new Error(result.error || 'Generation failed'),
        };
      }

      console.log(`✅ [NEUROPHOTO] Generated ${result.imageUrls.length} images`);
      console.log(`⏱️  [NEUROPHOTO] Time: ${result.metadata?.generationTime}ms`);

      // Format model name for display
      const modelName = result.metadata?.model || 'Unknown';
      const modelDisplay = modelName.includes('flux-schnell')
        ? 'Flux Schnell ⚡️'
        : modelName.includes('flux-pro')
        ? 'Flux Pro 💎'
        : modelName.includes('flux-lora')
        ? 'Flux LoRA 🎭'
        : modelName.includes('sdxl')
        ? 'SDXL'
        : modelName;

      // Calculate approximate cost for fal.ai (if used)
      const isFal = provider === 'fal';
      const width = 768;
      const height = 1365;
      const megapixels = (width * height) / 1000000;
      const estimatedCost = isFal ? (megapixels * 0.035).toFixed(3) : null;

      // Build beautiful result message like Midjourney/DALL-E
      let resultText = `✨ **Изображение создано!**

━━━━━━━━━━━━━━━━━━━━
📝 **Промпт**
${prompt}

🎨 **Детали генерации**`;

      // Add LoRA info if used (like DALL-E shows provenance)
      if (result.metadata?.loraUsed) {
        resultText += `\n├ 🎭 Персонализация: **${result.metadata.triggerWord}**`;
      }

      resultText += `
├ 🤖 Модель: **${modelDisplay}**
├ 📐 Размер: **${width}×${height}** (9:16)
├ ⏱ Время: **${Math.round((result.metadata?.generationTime || 0) / 1000)}с**`;

      // Add cost estimate for fal.ai
      if (estimatedCost) {
        resultText += `\n├ 💰 Стоимость: ~$${estimatedCost}`;
      }

      resultText += `
└ 🔗 Provider: **${provider === 'fal' ? 'Fal.ai' : 'Replicate'}**

━━━━━━━━━━━━━━━━━━━━
🔍 **Техническая информация**
Model ID: \`${modelName}\``;

      if (result.metadata?.loraUsed) {
        resultText += `\nLoRA: \`${result.metadata.triggerWord}\``;
      }

      resultText += `
Generated: ${new Date().toLocaleString('ru-RU')}

_Создано с помощью AI • @999-agents_`;

      // Send result with image
      await callback?.({
        text: resultText,
        attachments: result.imageUrls.map((url, index) => ({
          id: `neurophoto-${Date.now()}-${index}`,
          url,
          type: 'image',
          title: prompt,
          description: `Generated by ${modelDisplay}${result.metadata?.triggerWord ? ' with ' + result.metadata.triggerWord : ''}`,
        })),
      });

      return {
        success: true,
        text: 'Изображение успешно сгенерировано',
        data: {
          imageUrls: result.imageUrls,
          prompt,
          model: result.metadata?.model,
          generationTime: result.metadata?.generationTime,
        },
      };
    } catch (error) {
      console.error('❌ [NEUROPHOTO] Unexpected error:', error);

      await callback?.({
        text: '❌ Произошла непредвиденная ошибка при генерации изображения. Попробуйте позже или обратитесь к администратору.',
      });

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  /**
   * Example conversations for training
   * These help the LLM understand when to trigger image generation
   */
  examples: [
    // Прямая команда
    [
      {
        name: 'user',
        content: { text: '/neurophoto красивый закат над океаном' },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Изображение готово!\n\n📝 **Промпт**: красивый закат над океаном\n🤖 **Модель**: Flux Schnell (black-forest-labs/flux-schnell)\n⏱️ **Время**: 15 сек',
          action: 'GENERATE_NEUROPHOTO',
        },
      },
    ],
    // Естественный запрос с "создай"
    [
      {
        name: 'user',
        content: { text: 'создай изображение футуристического города с летающими машинами' },
      },
      {
        name: 'assistant',
        content: {
          text: '🎨 Генерирую изображение футуристического города...',
          action: 'GENERATE_NEUROPHOTO',
        },
      },
    ],
    // Естественный запрос с "нарисуй"
    [
      {
        name: 'user',
        content: { text: 'нарисуй кота в космическом шлеме' },
      },
      {
        name: 'assistant',
        content: {
          text: '✅ Готово!\n\n📝 Промпт: кота в космическом шлеме\n🤖 Модель: Flux Schnell',
          action: 'GENERATE_NEUROPHOTO',
        },
      },
    ],
    // Вопрос "покажи как выглядит"
    [
      {
        name: 'user',
        content: { text: 'покажи как выглядит закат на Марсе' },
      },
      {
        name: 'assistant',
        content: {
          text: '🎨 Создаю визуализацию заката на Марсе...',
          action: 'GENERATE_NEUROPHOTO',
        },
      },
    ],
    // Английский запрос
    [
      {
        name: 'user',
        content: { text: 'can you draw a dragon flying over mountains?' },
      },
      {
        name: 'assistant',
        content: {
          text: '🎨 Generating image of a dragon...',
          action: 'GENERATE_NEUROPHOTO',
        },
      },
    ],
    // Запрос с "сделай фото"
    [
      {
        name: 'user',
        content: { text: 'сделай фото уютной кофейни' },
      },
      {
        name: 'assistant',
        content: {
          text: '🎨 Создаю изображение уютной кофейни...',
          action: 'GENERATE_NEUROPHOTO',
        },
      },
    ],
  ] as ActionExample[][],
};
