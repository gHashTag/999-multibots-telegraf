/**
 * @999-agents/plugin-neurophoto
 * ElizaOS plugin for AI image generation with Replicate
 *
 * @author 999-agents
 * @license MIT
 * @version 0.1.0
 */

import { Plugin } from '@elizaos/core';
import { generateImageAction } from './actions/generateImage.js';
import { replicateProvider } from './providers/replicateProvider.js';
import { ReplicateService } from './services/replicateService.js';

/**
 * Neurophoto Plugin for ElizaOS
 *
 * Provides AI image generation capabilities using Replicate API
 *
 * @example
 * ```typescript
 * import { neurophotoPlugin } from '@999-agents/plugin-neurophoto';
 *
 * export const character: Character = {
 *   plugins: [neurophotoPlugin],
 *   settings: {
 *     REPLICATE_API_KEY: 'your-api-key',
 *   },
 * };
 * ```
 */
export const neurophotoPlugin: Plugin = {
  name: 'neurophoto',
  description: 'AI image generation with Replicate models',

  /**
   * Actions that the agent can perform
   */
  actions: [generateImageAction],

  /**
   * Providers that give context to the LLM
   */
  providers: [replicateProvider],

  /**
   * Services that handle external integrations
   */
  services: [ReplicateService],

  /**
   * Evaluators (none for MVP)
   */
  evaluators: [],
};

/**
 * Export everything for external use
 */
export * from './types/index.js';
export * from './actions/generateImage.js';
export * from './providers/replicateProvider.js';
export * from './services/replicateService.js';

/**
 * Default export
 */
export default neurophotoPlugin;
