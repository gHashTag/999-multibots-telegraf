/**
 * @999-agents/plugin-neurophoto - Replicate Provider
 * Provides context about image generation capabilities to the LLM
 */

import { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { DEFAULT_MODELS } from '../types/index.js';

export const replicateProvider: Provider = {
  /**
   * Get context about image generation capabilities
   */
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<string> => {
    const defaultModel = runtime.getSetting('DEFAULT_MODEL') || DEFAULT_MODELS.FLUX_SCHNELL;

    return `
# 🎨 AI Image Generation Capabilities

## Available Commands
- \`/neurophoto <описание>\` - Генерация AI-изображения
- \`нарисуй <описание>\` - Альтернативная команда
- \`создай изображение <описание>\` - Русская версия

## Current Configuration
- **Default Model**: ${defaultModel}
- **Generation Time**: 10-30 seconds
- **Image Format**: 1024x1024 (1:1 aspect ratio)
- **Output**: High-quality AI-generated images

## Examples
✅ **Good prompts**:
- "/neurophoto beautiful sunset over the ocean with palm trees"
- "нарисуй футуристический город с летающими машинами"
- "create image of a cat in a spacesuit"

❌ **Bad prompts**:
- "/neurophoto cat" (too short, not descriptive)
- "нарисуй" (no description)

## Tips for Better Results
1. Be specific and descriptive
2. Include details about style, colors, mood
3. Mention lighting and composition
4. Use English for best results with most models

## Available Models
- **Flux Schnell**: Fast, high-quality images (default)
- **Flux Pro**: Premium quality, slower
- **SDXL**: General-purpose, reliable

The system will automatically use the configured default model for all generations.
    `.trim();
  },
};
